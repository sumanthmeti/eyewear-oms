from fastapi import FastAPI, HTTPException, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone, timedelta
import os
from dotenv import load_dotenv
import pickle
import numpy as np

load_dotenv()

# ── XGBoost model — loaded once at startup ───────────────────
ML_MODEL = None

LENS_TYPE_INDEX = {
    "Single Vision": 0, "Blue Cut": 1,
    "Photochromic": 2,  "Bifocal": 3, "Progressive": 4,
}
STATUS_INDEX = {
    "Order Placed": 0,          "Prescription Verified": 1,
    "Lens Cutting": 2,          "Coating Applied": 3,
    "Assembly": 4,              "Quality Check": 5,
    "QC Failed": 6,             "Dispatch Ready": 7,
    "Dispatched": 8,
}

app = FastAPI(title="Eyewear OMS API", version="1.0.0")

@app.on_event("startup")
def load_model():
    global ML_MODEL
    path = os.path.join(os.path.dirname(__file__), "tat_model.pkl")
    if os.path.exists(path):
        with open(path, "rb") as f:
            bundle = pickle.load(f)
        ML_MODEL = bundle["model"]
        print("✅ XGBoost TAT model loaded")
    else:
        print("⚠️  tat_model.pkl not found — using rule-based fallback")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

supabase: Client = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_KEY")
)

# ─────────────────────────────────────────────
# CONSTANTS
# ─────────────────────────────────────────────

SLA_HOURS = {
    "Single Vision": 48,
    "Blue Cut":      72,
    "Photochromic":  96,
    "Bifocal":       120,
    "Progressive":   168,
}

STAGE_RISK = {
    "Order Placed":         0.10,
    "Prescription Verified":0.15,
    "Lens Cutting":         0.30,
    "Coating Applied":      0.40,
    "Assembly":             0.60,
    "Quality Check":        0.70,
    "QC Failed":            0.95,
    "Dispatch Ready":       0.05,
}

# ─────────────────────────────────────────────
# REQUEST MODELS
# ─────────────────────────────────────────────

class CreateOrderRequest(BaseModel):
    customer_name:  str
    customer_phone: Optional[str] = None
    customer_email: Optional[str] = None
    store_location: str
    rx_sph_r:  Optional[float] = None
    rx_cyl_r:  Optional[float] = None
    rx_axis_r: Optional[int]   = None
    rx_add_r:  Optional[float] = None
    rx_sph_l:  Optional[float] = None
    rx_cyl_l:  Optional[float] = None
    rx_axis_l: Optional[int]   = None
    rx_add_l:  Optional[float] = None
    lens_type:  str
    lens_index: str
    coating:    Optional[str] = None
    frame:      Optional[str] = None
    source:     Optional[str] = None
    notes:      Optional[str] = None

class UpdateStatusRequest(BaseModel):
    new_status: str
    changed_by: str
    reason:     Optional[str] = None

# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

def new_order_number() -> str:
    """Use the Postgres sequence — guaranteed unique, no collisions."""
    res = supabase.rpc("next_order_number").execute()
    return res.data

def stock_check(sph: float, lens_type: str, lens_index: str, coating: str) -> bool:
    power = f"{sph:+.2f}" if sph is not None else "0.00"
    res = (
        supabase.table("inventory")
        .select("quantity")
        .eq("lens_power", power)
        .eq("lens_type",  lens_type)
        .eq("lens_index", lens_index)
        .eq("coating",    coating)
        .execute()
    )
    return bool(res.data and res.data[0]["quantity"] > 0)

def breach_score(hours_remaining, sla_hours, status, in_stock) -> float:
    if hours_remaining is None:
        hours_remaining = 0

    # ── XGBoost prediction ───────────────────────────────────
    if ML_MODEL is not None:
        try:
            hours_elapsed = max(0, sla_hours - hours_remaining)
            pct_time_used = hours_elapsed / sla_hours if sla_hours else 1.0
            qc_failed     = 1 if status == "QC Failed" else 0
            features = [[
                STATUS_INDEX.get(status, 0),
                round(hours_elapsed, 1),
                sla_hours,
                round(pct_time_used, 3),
                int(in_stock),
                qc_failed,
                LENS_TYPE_INDEX.get("Single Vision", 0),  # default
            ]]
            prob = ML_MODEL.predict_proba(np.array(features))[0][1]
            return round(float(prob), 2)
        except Exception as e:
            print(f"XGBoost error: {e} — falling back to rules")

    # ── Rule-based fallback ──────────────────────────────────
    stage_w = STAGE_RISK.get(status, 0.2)
    if hours_remaining < 0:        time_score = 1.0
    elif hours_remaining < 4:      time_score = 0.95
    elif hours_remaining < 8:      time_score = 0.80
    elif hours_remaining < 16:     time_score = 0.60
    elif hours_remaining < 24:     time_score = 0.40
    else: time_score = max(0.05, 1 - (hours_remaining / sla_hours))
    stock_penalty = 0.20 if not in_stock else 0.0
    return round(min(1.0, time_score * 0.6 + stage_w * 0.3 + stock_penalty), 2)

def send_email_alert(order: dict, alert_type: str):
    """
    Send email via Resend.
    Set RESEND_API_KEY and ALERT_EMAIL in your .env to activate.
    """
    resend_key = os.getenv("RESEND_API_KEY")
    alert_email = os.getenv("ALERT_EMAIL")
    if not resend_key or not alert_email:
        print(f"[ALERT SKIPPED] No Resend config. Would have sent: {alert_type} for {order.get('order_number')}")
        return
    try:
        import resend as resend_lib
        resend_lib.api_key = resend_key
        resend_lib.Emails.send({
            "from":    "onboarding@resend.dev",
            "to":      [alert_email],
            "subject": f"⚠️ {alert_type}: Order {order['order_number']}",
            "html": f"""
                <h2 style='color:#e53e3e'>SLA Alert — {alert_type}</h2>
                <table>
                  <tr><td><b>Order</b></td><td>{order['order_number']}</td></tr>
                  <tr><td><b>Customer</b></td><td>{order['customer_name']}</td></tr>
                  <tr><td><b>Store</b></td><td>{order['store_location']}</td></tr>
                  <tr><td><b>Lens Type</b></td><td>{order['lens_type']}</td></tr>
                  <tr><td><b>Current Stage</b></td><td>{order['status']}</td></tr>
                  <tr><td><b>Expected Delivery</b></td><td>{order.get('expected_delivery','N/A')}</td></tr>
                </table>
            """
        })
        print(f"[EMAIL SENT] {alert_type} for {order['order_number']}")
    except Exception as e:
        print(f"[EMAIL ERROR] {e}")

def auto_alert(order: dict, probability: float):
    """Background task: create alert only if no open alert exists."""
    existing = (
        supabase.table("alerts")
        .select("id")
        .eq("order_id", order["id"])
        .eq("resolved", False)
        .in_("alert_type", ["SLA_BREACH_RISK", "SLA_BREACHED"])
        .execute()
    )
    if existing.data:
        return
    hrs = order.get("hours_remaining", 0)
    alert_type = "SLA_BREACHED" if hrs < 0 else "SLA_BREACH_RISK"
    msg = (
        f"{order['order_number']} — breach probability {int(probability*100)}%. "
        f"Stage: {order['status']}. Hours left: {round(hrs,1)}."
    )
    supabase.table("alerts").insert({
        "order_id":   order["id"],
        "alert_type": alert_type,
        "message":    msg,
    }).execute()
    send_email_alert(order, alert_type)

# ─────────────────────────────────────────────
# ROUTES — HEALTH
# ─────────────────────────────────────────────

@app.get("/")
def health():
    return {"status": "ok", "service": "Eyewear OMS API v1"}

# ─────────────────────────────────────────────
# ROUTES — ORDERS
# ─────────────────────────────────────────────

@app.get("/orders")
def list_orders(
    status:         Optional[str] = None,
    lens_type:      Optional[str] = None,
    store_location: Optional[str] = None,
    sla_status:     Optional[str] = None,   # on_track | at_risk | breached | completed
):
    q = supabase.table("dashboard_orders").select("*")
    if status:
        q = q.eq("status", status)
    if lens_type:
        q = q.eq("lens_type", lens_type)
    if store_location:
        q = q.eq("store_location", store_location)

    rows = q.order("expected_delivery", desc=False).execute().data

    if sla_status:
        rows = [r for r in rows if r.get("sla_status") == sla_status]

    return {"orders": rows, "total": len(rows)}


@app.post("/orders", status_code=201)
def create_order(body: CreateOrderRequest, bg: BackgroundTasks):
    sla   = SLA_HOURS.get(body.lens_type, 48)
    now   = datetime.now(timezone.utc)
    exp   = (now + timedelta(hours=sla)).isoformat()
    coating = body.coating or "Anti-Reflective"

    in_stock = stock_check(body.rx_sph_r, body.lens_type, body.lens_index, coating)

    row = {
        "order_number":    new_order_number(),
        "customer_name":   body.customer_name,
        "customer_phone":  body.customer_phone,
        "customer_email":  body.customer_email,
        "store_location":  body.store_location,
        "rx_sph_r": body.rx_sph_r,  "rx_cyl_r": body.rx_cyl_r,
        "rx_axis_r": body.rx_axis_r, "rx_add_r": body.rx_add_r,
        "rx_sph_l": body.rx_sph_l,  "rx_cyl_l": body.rx_cyl_l,
        "rx_axis_l": body.rx_axis_l, "rx_add_l": body.rx_add_l,
        "lens_type":  body.lens_type,
        "lens_index": body.lens_index,
        "coating":    coating,
        "frame":      body.frame,
        "status":     "Order Placed",
        "sla_hours":  sla,
        "created_at": now.isoformat(),
        "expected_delivery": exp,
        "source":     body.source,
        "is_in_stock": in_stock,
        "notes":      body.notes,
    }

    created = supabase.table("orders").insert(row).execute().data[0]
    # NOTE: status_log is written automatically by trg_order_created trigger.
    # No second query needed here — the DB guarantees the record.

    # Out-of-stock alert
    if not in_stock:
        supabase.table("alerts").insert({
            "order_id":   created["id"],
            "alert_type": "OUT_OF_STOCK",
            "message":    f"{created['order_number']}: Lens {body.rx_sph_r} / {body.lens_index} {coating} is OUT OF STOCK. Sourcing required.",
        }).execute()

    return {
        "order":    created,
        "in_stock": in_stock,
        "sla_hours": sla,
        "message":  "Order created" if in_stock else "Order created — lens not in stock, sourcing required",
    }


@app.get("/orders/{order_id}")
def get_order(order_id: str):
    order = supabase.table("dashboard_orders").select("*").eq("id", order_id).execute().data
    if not order:
        raise HTTPException(404, "Order not found")
    logs  = (
        supabase.table("status_log")
        .select("*")
        .eq("order_id", order_id)
        .order("changed_at")
        .execute().data
    )
    return {"order": order[0], "status_log": logs}


@app.patch("/orders/{order_id}/status")
def update_status(order_id: str, body: UpdateStatusRequest, bg: BackgroundTasks):
    current = supabase.table("orders").select("*").eq("id", order_id).execute().data
    if not current:
        raise HTTPException(404, "Order not found")
    order = current[0]

    # Single atomic UPDATE — trigger reads last_changed_by + last_change_reason
    # and writes status_log in the same transaction. No crash gap possible.
    supabase.table("orders").update({
        "status":              body.new_status,
        "last_changed_by":     body.changed_by,
        "last_change_reason":  body.reason,
    }).eq("id", order_id).execute()
    # status_log is written by trg_status_change trigger — no second query needed.

    # QC failure → auto-alert
    if body.new_status == "QC Failed":
        supabase.table("alerts").insert({
            "order_id":   order_id,
            "alert_type": "QC_FAILED",
            "message":    f"{order['order_number']} failed QC. Reason: {body.reason or 'Not specified'}. Lens re-cut required.",
        }).execute()
        bg.add_task(send_email_alert, order, "QC_FAILED")

    return {
        "message":    "Status updated",
        "old_status": order["status"],
        "new_status": body.new_status,
    }

# ─────────────────────────────────────────────
# ROUTES — INVENTORY
# ─────────────────────────────────────────────

@app.get("/inventory")
def get_inventory():
    res = (
        supabase.table("inventory")
        .select("*")
        .order("lens_type")
        .order("lens_power")
        .execute()
    )
    return {"inventory": res.data, "total": len(res.data)}


@app.get("/inventory/check")
def check_stock_api(
    lens_power: str = Query(..., example="-1.00"),
    lens_type:  str = Query(..., example="Single Vision"),
    lens_index: str = Query(..., example="1.56"),
    coating:    str = Query(default="Anti-Reflective"),
):
    res = (
        supabase.table("inventory")
        .select("*")
        .eq("lens_power", lens_power)
        .eq("lens_type",  lens_type)
        .eq("lens_index", lens_index)
        .eq("coating",    coating)
        .execute()
    )
    if not res.data:
        return {"in_stock": False, "quantity": 0, "message": "No inventory record found for this combination"}
    item = res.data[0]
    return {
        "in_stock": item["quantity"] > 0,
        "quantity": item["quantity"],
        "message":  f"{item['quantity']} units available" if item["quantity"] > 0 else "Out of stock — sourcing required",
    }

# ─────────────────────────────────────────────
# ROUTES — DASHBOARD
# ─────────────────────────────────────────────

@app.get("/dashboard/summary")
def dashboard_summary():
    orders = supabase.table("dashboard_orders").select("*").execute().data
    alerts = supabase.table("alerts").select("*").eq("resolved", False).execute().data

    by_status = {}
    by_sla    = {"on_track": 0, "at_risk": 0, "breached": 0, "completed": 0}
    by_store  = {}
    by_lens   = {}

    for o in orders:
        s = o["status"]
        by_status[s] = by_status.get(s, 0) + 1

        sla = o.get("sla_status", "on_track")
        by_sla[sla] = by_sla.get(sla, 0) + 1

        store = o["store_location"]
        by_store[store] = by_store.get(store, 0) + 1

        lt = o["lens_type"]
        by_lens[lt] = by_lens.get(lt, 0) + 1

    active = len([o for o in orders if o["status"] not in ("Delivered", "Dispatched")])

    return {
        "total_orders":   len(orders),
        "active_orders":  active,
        "by_sla_status":  by_sla,
        "by_status":      by_status,
        "by_store":       by_store,
        "by_lens_type":   by_lens,
        "active_alerts":  len(alerts),
    }

# ─────────────────────────────────────────────
# ROUTES — ALERTS
# ─────────────────────────────────────────────

@app.get("/alerts")
def get_alerts(resolved: bool = False):
    res = (
        supabase.table("alerts")
        .select("*, orders(order_number, customer_name, store_location, status)")
        .eq("resolved", resolved)
        .order("triggered_at", desc=True)
        .execute()
    )
    return {"alerts": res.data, "total": len(res.data)}


@app.patch("/alerts/{alert_id}/resolve")
def resolve_alert(alert_id: str):
    supabase.table("alerts").update({
        "resolved":    True,
        "resolved_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", alert_id).execute()
    return {"message": "Alert resolved"}

# ─────────────────────────────────────────────
# ROUTES — TAT PREDICTION
# ─────────────────────────────────────────────

@app.get("/predictions/breach-risk")
def predict_breach(bg: BackgroundTasks):
    """
    Scores every active order's breach probability.
    Uses weighted rule-based model (XGBoost slot ready).
    Orders with score >= 0.5 are flagged; >= 0.8 auto-trigger alerts.
    """
    orders = (
        supabase.table("dashboard_orders")
        .select("*")
        .not_.in_("status", ["Delivered", "Dispatched", "Dispatch Ready"])
        .execute().data
    )

    results = []
    for o in orders:
        hrs  = o.get("hours_remaining") or 0
        sla  = o.get("sla_hours") or 48
        prob = breach_score(hrs, sla, o.get("status",""), o.get("is_in_stock", True))

        if prob >= 0.5:
            results.append({
                "order_id":          o["id"],
                "order_number":      o["order_number"],
                "customer_name":     o["customer_name"],
                "store_location":    o["store_location"],
                "lens_type":         o["lens_type"],
                "status":            o["status"],
                "hours_remaining":   round(hrs, 1),
                "sla_status":        o.get("sla_status"),
                "breach_probability": prob,
                "is_in_stock":       o.get("is_in_stock", True),
            })

            if prob >= 0.80:
                bg.add_task(auto_alert, o, prob)

    results.sort(key=lambda x: x["breach_probability"], reverse=True)
    return {
    "model_used": "xgboost" if ML_MODEL is not None else "rule-based",
    "at_risk_orders": results,
    "total_at_risk": len(results)
}





@app.get("/test/send-email")
def test_email():
    resend_key = os.getenv("RESEND_API_KEY")
    alert_email = os.getenv("ALERT_EMAIL")
    if not resend_key or not alert_email:
        return {"error": "RESEND_API_KEY or ALERT_EMAIL not configured"}
    try:
        import resend as resend_lib
        resend_lib.api_key = resend_key
        resend_lib.Emails.send({
            "from":    "onboarding@resend.dev",
            "to":      [alert_email],
            "subject": "⚠️ SLA Breach Alert: Eyewear OMS",
            "html":    """
                <h2 style='color:#e53e3e'>SLA Breach Alert</h2>
                <p><b>Order EYE-023</b> has breached SLA by 52 hours.</p>
                <p><b>Customer:</b> Madhavan Nair</p>
                <p><b>Store:</b> Chennai</p>
                <p><b>Stage:</b> QC Failed</p>
                <p><b>Lens:</b> Progressive 1.74</p>
                <p><b>Issue:</b> Out of stock + QC failure</p>
            """
        })
        return {"message": f"✅ Test email sent to {alert_email}"}
    except Exception as e:
        return {"error": str(e)}