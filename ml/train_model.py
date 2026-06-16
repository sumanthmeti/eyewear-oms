"""
Train XGBoost TAT breach prediction model.
Run from the ml/ folder:
    pip install xgboost scikit-learn pandas joblib
    python train_model.py
Then copy tat_model.pkl into your backend/ folder.
"""

import pandas as pd
import numpy as np
import pickle, random
from xgboost import XGBClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, roc_auc_score

# ── Must match main.py exactly ───────────────────────────────

LENS_TYPES = ['Single Vision', 'Blue Cut', 'Photochromic', 'Bifocal', 'Progressive']
SLA_MAP    = {'Single Vision': 48, 'Blue Cut': 72, 'Photochromic': 96, 'Bifocal': 120, 'Progressive': 168}
LENS_IDX   = {lt: i for i, lt in enumerate(LENS_TYPES)}

STAGES = [
    'Order Placed', 'Prescription Verified', 'Lens Cutting',
    'Coating Applied', 'Assembly', 'Quality Check',
    'QC Failed', 'Dispatch Ready', 'Dispatched', 'Delivered'
]
STAGE_IDX = {s: i for i, s in enumerate(STAGES)}

# Feature order must match main.py breach_score() exactly
FEATURES = [
    'stage_index',       # STATUS_INDEX.get(status)
    'hours_elapsed',     # max(0, sla_hours - hours_remaining)
    'sla_hours',         # order sla_hours
    'pct_time_used',     # hours_elapsed / sla_hours
    'is_in_stock',       # int(in_stock)
    'qc_failed',         # int(had_qc_failure)
    'lens_type_encoded', # LENS_TYPE_INDEX.get(lens_type)
]

# ── Generate 600 synthetic samples ───────────────────────────

random.seed(42)
np.random.seed(42)

def make_sample():
    lens_type = random.choice(LENS_TYPES)
    sla       = SLA_MAP[lens_type]
    stage     = random.choices(STAGES, weights=[1,2,3,3,4,3,2,1,1,1])[0]
    stage_idx = STAGE_IDX[stage]

    base_pct      = stage_idx / 9
    pct_time_used = base_pct * random.uniform(0.5, 1.6)
    hours_elapsed   = round(sla * pct_time_used, 2)
    hours_remaining = sla - hours_elapsed

    is_in_stock = 1 if random.random() > 0.18 else 0
    qc_failed   = 1 if (stage == 'QC Failed' or
                        (stage_idx >= 5 and random.random() < 0.12)) else 0

    # Breach label
    if stage in ('Delivered', 'Dispatched'):
        breached = 0
    else:
        p = 0.0
        if pct_time_used > 1.10: p += 0.75
        elif pct_time_used > 1.0: p += 0.60
        elif pct_time_used > 0.90: p += 0.45
        elif pct_time_used > 0.80: p += 0.28
        elif pct_time_used > 0.70: p += 0.14

        if qc_failed:       p += 0.30
        if not is_in_stock: p += 0.22
        if stage_idx >= 4 and pct_time_used > 0.65: p += 0.15

        p = max(0.0, min(1.0, p + np.random.normal(0, 0.08)))
        breached = int(p >= 0.50)

    return {
        'stage_index':       stage_idx,
        'hours_elapsed':     hours_elapsed,
        'sla_hours':         sla,
        'pct_time_used':     round(pct_time_used, 4),
        'is_in_stock':       is_in_stock,
        'qc_failed':         qc_failed,
        'lens_type_encoded': LENS_IDX[lens_type],
        'breached':          breached,
    }

print("Generating 600 training samples...")
df = pd.DataFrame([make_sample() for _ in range(600)])
df.to_csv('training_data.csv', index=False)
print(f"Breach rate: {df['breached'].mean():.1%}  ({df['breached'].sum()} breached / {len(df)} total)\n")

# ── Train ─────────────────────────────────────────────────────

X = df[FEATURES]
y = df['breached']

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, stratify=y, random_state=42
)

model = XGBClassifier(
    n_estimators=150,
    max_depth=4,
    learning_rate=0.08,
    subsample=0.85,
    colsample_bytree=0.85,
    min_child_weight=3,
    eval_metric='logloss',
    random_state=42,
)

model.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)

# ── Evaluate ──────────────────────────────────────────────────

y_pred  = model.predict(X_test)
y_proba = model.predict_proba(X_test)[:, 1]

print("── Performance ─────────────────────────────────────")
print(classification_report(y_test, y_pred, target_names=['No Breach','Breach']))
print(f"ROC-AUC : {roc_auc_score(y_test, y_proba):.3f}\n")

print("── Feature Importances ─────────────────────────────")
for feat, imp in sorted(zip(FEATURES, model.feature_importances_), key=lambda x: -x[1]):
    print(f"  {feat:<22} {'#' * int(imp*40)} {imp:.3f}")

# ── Save as bundle (main.py expects this format) ─────────────

bundle = {"model": model, "features": FEATURES}
with open("tat_model.pkl", "wb") as f:
    pickle.dump(bundle, f)

print("\n✅  tat_model.pkl saved")
print("    Copy it into your backend/ folder then restart uvicorn")
