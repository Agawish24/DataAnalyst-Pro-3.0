from flask import Flask, request, jsonify, g
from flask_cors import CORS
import pandas as pd
import numpy as np
from sklearn.linear_model import LinearRegression, LogisticRegression
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor, IsolationForest
from sklearn.cluster import KMeans, DBSCAN
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, r2_score, accuracy_score, classification_report
from statsmodels.tsa.holtwinters import ExponentialSmoothing
from statsmodels.tsa.arima.model import ARIMA
import warnings, time, logging, os as _os
warnings.filterwarnings('ignore')

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%dT%H:%M:%S'
)
logger = logging.getLogger('python-analytics')

app = Flask(__name__)
CORS(app)

_PYTHON_API_KEY = _os.environ.get('PYTHON_SERVICE_API_KEY')

@app.before_request
def start_timer():
    g.start_time = time.time()

@app.after_request
def log_request(response):
    duration_ms = round((time.time() - g.start_time) * 1000, 1)
    level = logging.WARNING if response.status_code >= 400 else logging.INFO
    logger.log(level, '%s %s → %d (%s ms)', request.method, request.path, response.status_code, duration_ms)
    response.headers['X-Duration-Ms'] = str(duration_ms)
    return response

@app.before_request
def verify_internal_key():
    if request.path in ('/health', '/') or request.method == 'OPTIONS':
        return None
    if _PYTHON_API_KEY:
        incoming = request.headers.get('X-API-Key', '')
        if incoming != _PYTHON_API_KEY:
            return jsonify({'error': 'Unauthorized — missing or invalid X-API-Key'}), 401
    return None

def validate_df(df, min_rows=2, required_numeric=0, context='endpoint'):
    """Validate a DataFrame before running ML. Returns (ok, error_str)."""
    if df is None or df.empty:
        return False, f'{context}: no data rows provided'
    if len(df) < min_rows:
        return False, f'{context}: need at least {min_rows} rows, got {len(df)}'
    if required_numeric > 0:
        n_numeric = len(df.select_dtypes(include=[np.number]).columns)
        if n_numeric < required_numeric:
            return False, f'{context}: need at least {required_numeric} numeric column(s), found {n_numeric}'
    return True, None

def df_from_rows(rows):
    df = pd.DataFrame(rows)
    for col in df.columns:
        try:
            df[col] = pd.to_numeric(df[col])
        except (ValueError, TypeError):
            pass
    return df

@app.route('/health')
def health():
    return jsonify({'status': 'ok', 'service': 'python-analytics'})

@app.route('/analytics/regression', methods=['POST'])
def regression():
    try:
        body = request.get_json()
        df = df_from_rows(body.get('data', []))
        ok, err = validate_df(df, min_rows=10, required_numeric=1, context='regression')
        if not ok:
            return jsonify({'error': err}), 400
        target = body.get('target')
        features = body.get('features', [])
        model_type = body.get('model', 'linear')

        # Auto-select first numeric column when target not provided
        if not target:
            num_cols = df.select_dtypes(include=[np.number]).columns.tolist()
            target = num_cols[0] if num_cols else None
        if not target or target not in df.columns:
            return jsonify({'error': f'Target column "{target}" not found — provide target in request body'}), 400

        if not features:
            features = [c for c in df.select_dtypes(include=[np.number]).columns if c != target]

        df_clean = df[features + [target]].dropna()
        X = df_clean[features]
        y = df_clean[target]

        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
        scaler = StandardScaler()
        X_train_s = scaler.fit_transform(X_train)
        X_test_s = scaler.transform(X_test)

        if model_type == 'random_forest':
            model = RandomForestRegressor(n_estimators=100, random_state=42)
        else:
            model = LinearRegression()

        model.fit(X_train_s, y_train)
        y_pred = model.predict(X_test_s)

        result = {
            'model': model_type,
            'features': features,
            'target': target,
            'metrics': {
                'r2_score': round(r2_score(y_test, y_pred), 4),
                'rmse': round(float(np.sqrt(mean_squared_error(y_test, y_pred))), 4),
                'mse': round(float(mean_squared_error(y_test, y_pred)), 4)
            },
            'sample_size': len(df_clean),
            'train_size': len(X_train),
            'test_size': len(X_test),
            'predictions': [{'actual': float(a), 'predicted': float(p)} for a, p in zip(y_test.values[:50], y_pred[:50])]
        }

        if model_type == 'linear' and hasattr(model, 'coef_'):
            result['coefficients'] = dict(zip(features, [round(float(c), 4) for c in model.coef_]))
            result['intercept'] = round(float(model.intercept_), 4)
        elif hasattr(model, 'feature_importances_'):
            result['feature_importance'] = dict(zip(features, [round(float(c), 4) for c in model.feature_importances_]))

        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/analytics/clustering', methods=['POST'])
def clustering():
    try:
        body = request.get_json()
        df = df_from_rows(body.get('data', []))
        ok, err = validate_df(df, min_rows=5, required_numeric=1, context='clustering')
        if not ok:
            return jsonify({'error': err}), 400
        features = body.get('features', [])
        n_clusters = int(body.get('n_clusters', 3))
        algorithm = body.get('algorithm', 'kmeans')

        if not features:
            features = list(df.select_dtypes(include=[np.number]).columns)

        df_clean = df[features].dropna()
        scaler = StandardScaler()
        X = scaler.fit_transform(df_clean)

        if algorithm == 'dbscan':
            model = DBSCAN(eps=body.get('eps', 0.5), min_samples=body.get('min_samples', 5))
        else:
            model = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)

        labels = model.fit_predict(X)
        df_clean = df_clean.copy()
        df_clean['cluster'] = labels

        cluster_stats = df_clean.groupby('cluster').agg(['mean', 'std', 'count']).round(4)
        unique_labels, counts = np.unique(labels, return_counts=True)

        return jsonify({
            'algorithm': algorithm,
            'features': features,
            'n_clusters': int(len(unique_labels)),
            'cluster_sizes': dict(zip([int(l) for l in unique_labels], [int(c) for c in counts])),
            'cluster_centers': df_clean.groupby('cluster')[features].mean().round(4).to_dict(),
            'sample_points': df_clean.head(200).to_dict(orient='records'),
            'inertia': float(model.inertia_) if hasattr(model, 'inertia_') else None
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/analytics/classification', methods=['POST'])
def classification():
    try:
        body = request.get_json()
        df = df_from_rows(body.get('data', []))
        target = body.get('target')
        features = body.get('features', [])
        model_type = body.get('model', 'random_forest')

        if not target or target not in df.columns:
            return jsonify({'error': f'Target column "{target}" not found'}), 400

        if not features:
            features = [c for c in df.select_dtypes(include=[np.number]).columns if c != target]

        df_clean = df[features + [target]].dropna()
        le = LabelEncoder()
        y = le.fit_transform(df_clean[target].astype(str))
        X = df_clean[features]

        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
        scaler = StandardScaler()
        X_train_s = scaler.fit_transform(X_train)
        X_test_s = scaler.transform(X_test)

        if model_type == 'logistic':
            model = LogisticRegression(random_state=42, max_iter=1000)
        else:
            model = RandomForestClassifier(n_estimators=100, random_state=42)

        model.fit(X_train_s, y_train)
        y_pred = model.predict(X_test_s)

        result = {
            'model': model_type,
            'features': features,
            'target': target,
            'classes': list(le.classes_),
            'accuracy': round(float(accuracy_score(y_test, y_pred)), 4),
            'sample_size': len(df_clean),
        }
        if hasattr(model, 'feature_importances_'):
            result['feature_importance'] = dict(zip(features, [round(float(c), 4) for c in model.feature_importances_]))

        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/analytics/forecast', methods=['POST'])
def forecast():
    try:
        body = request.get_json()
        df = df_from_rows(body.get('data', []))
        ok, err = validate_df(df, min_rows=4, context='forecast')
        if not ok:
            return jsonify({'error': err}), 400
        value_col = body.get('value_column')
        date_col = body.get('date_column')
        periods = int(body.get('periods', 10))
        method = body.get('method', 'exponential')

        if not value_col or value_col not in df.columns:
            return jsonify({'error': f'Value column "{value_col}" not found'}), 400

        series = pd.to_numeric(df[value_col], errors='coerce').dropna()
        if len(series) < 4:
            return jsonify({'error': 'Need at least 4 data points for forecasting'}), 400

        if method == 'arima':
            model = ARIMA(series, order=(1,1,1))
            fitted = model.fit()
            forecast_vals = fitted.forecast(steps=periods)
            conf_int = fitted.get_forecast(steps=periods).conf_int()
        else:
            model = ExponentialSmoothing(series, trend='add', seasonal=None)
            fitted = model.fit()
            forecast_vals = fitted.forecast(periods)
            conf_int = None

        historical = [{'index': int(i), 'value': float(v)} for i, v in enumerate(series.values[-50:])]
        forecast_list = [{'index': int(len(series) + i), 'value': round(float(v), 4)} for i, v in enumerate(forecast_vals)]

        return jsonify({
            'method': method,
            'value_column': value_col,
            'historical': historical,
            'forecast': forecast_list,
            'periods': periods
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/analytics/outliers', methods=['POST'])
def outliers():
    try:
        body = request.get_json()
        df = df_from_rows(body.get('data', []))
        ok, err = validate_df(df, min_rows=5, required_numeric=1, context='outlier_detection')
        if not ok:
            return jsonify({'error': err}), 400
        features = body.get('features', [])

        if not features:
            features = list(df.select_dtypes(include=[np.number]).columns)

        df_clean = df[features].dropna()
        scaler = StandardScaler()
        X = scaler.fit_transform(df_clean)

        model = IsolationForest(contamination=0.1, random_state=42)
        preds = model.fit_predict(X)
        scores = model.decision_function(X)

        df_result = df_clean.copy()
        df_result['is_outlier'] = (preds == -1)
        df_result['anomaly_score'] = scores.round(4)

        outlier_indices = df_result[df_result['is_outlier']].index.tolist()

        return jsonify({
            'total_points': len(df_clean),
            'outliers_found': int((preds == -1).sum()),
            'outlier_percentage': round(float((preds == -1).mean() * 100), 2),
            'outlier_indices': outlier_indices[:100],
            'sample': df_result.head(200).to_dict(orient='records')
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/monte-carlo', methods=['POST'])
def monte_carlo():
    """
    Enterprise Monte Carlo simulation.
    Supports: normal, uniform, triangular, lognormal distributions.
    Returns: composite histogram, per-variable tornado sensitivity, confidence bands,
             baseline comparison, and distribution preview curves.
    """
    try:
        data = request.json
        variables = data.get('variables', [])
        iterations = int(data.get('iterations', 10000))
        iterations = min(iterations, 100000)
        baseline_value = float(data.get('baseline_value', 0))

        np.random.seed(42)
        PERCENTILES = [1, 5, 10, 25, 50, 75, 90, 95, 99]

        # ── Sample each variable across all iterations ────────────────────
        var_samples = {}  # name → array of N samples
        for var in variables:
            dist  = var.get('distribution', 'normal')
            base  = float(var.get('baseValue', 1))
            unc   = float(var.get('uncertainty', 0.1))
            lo    = float(var.get('min', base * (1 - unc)))
            hi    = float(var.get('max', base * (1 + unc)))

            if dist == 'normal':
                sigma = base * unc if unc <= 1 else unc
                samples = np.random.normal(base, max(sigma, 1e-9), iterations)
            elif dist == 'uniform':
                samples = np.random.uniform(lo, hi, iterations)
            elif dist == 'triangular':
                samples = np.random.triangular(lo, base, hi, iterations)
            elif dist == 'lognormal':
                # mu/sigma in log-space so that median = base
                sigma_ln = float(var.get('sigma', 0.3))
                mu_ln = np.log(max(base, 1e-9))
                samples = np.random.lognormal(mu_ln, sigma_ln, iterations)
            else:
                samples = np.full(iterations, base)

            var_samples[var.get('name', f'var_{len(var_samples)}')] = samples

        # ── Composite result = weighted sum across variables ──────────────
        composite = np.zeros(iterations)
        for var in variables:
            name   = var.get('name', '')
            weight = float(var.get('weight', 1))
            if name in var_samples:
                composite += var_samples[name] * weight

        composite_arr = composite

        # ── Histogram (50 bins) ───────────────────────────────────────────
        hist_counts, hist_edges = np.histogram(composite_arr, bins=50)

        # ── Per-variable tornado sensitivity ──────────────────────────────
        # Hold all variables at their base value; perturb one at a time by ±1 std
        tornado = []
        base_composite = sum(
            float(v.get('baseValue', 1)) * float(v.get('weight', 1))
            for v in variables
        )
        for var in variables:
            name   = var.get('name', '')
            base   = float(var.get('baseValue', 1))
            unc    = float(var.get('uncertainty', 0.1))
            weight = float(var.get('weight', 1))
            delta  = base * unc

            low_val  = (base_composite - delta * weight)
            high_val = (base_composite + delta * weight)

            tornado.append({
                'name':       name,
                'low':        round(float(low_val), 4),
                'high':       round(float(high_val), 4),
                'base':       round(float(base_composite), 4),
                'swing':      round(float(high_val - low_val), 4),
                'swing_pct':  round(float((high_val - low_val) / max(abs(base_composite), 1e-9) * 100), 2),
                'distribution': var.get('distribution', 'normal'),
            })

        tornado.sort(key=lambda x: abs(x['swing']), reverse=True)

        # ── Per-variable distribution preview (curve points) ──────────────
        dist_previews = {}
        for var in variables:
            name = var.get('name', '')
            if name not in var_samples:
                continue
            s = var_samples[name]
            mini, maxi = float(np.min(s)), float(np.max(s))
            x_pts = np.linspace(mini, maxi, 40).tolist()
            h, e  = np.histogram(s, bins=40)
            h_norm = (h / max(h.max(), 1)).tolist()
            dist_previews[name] = {'x': [round(v, 4) for v in x_pts], 'y': [round(v, 4) for v in h_norm]}

        # ── Confidence bands ──────────────────────────────────────────────
        pct_values = {str(p): round(float(np.percentile(composite_arr, p)), 4) for p in PERCENTILES}
        prob_above_baseline = float(np.mean(composite_arr > baseline_value)) if baseline_value else None

        return jsonify({
            'iterations':           iterations,
            'mean':                 round(float(np.mean(composite_arr)), 4),
            'std':                  round(float(np.std(composite_arr)), 4),
            'min':                  round(float(np.min(composite_arr)), 4),
            'max':                  round(float(np.max(composite_arr)), 4),
            'percentiles':          pct_values,
            'histogram':            {'counts': hist_counts.tolist(), 'edges': [round(float(e), 4) for e in hist_edges]},
            'tornado':              tornado,
            'dist_previews':        dist_previews,
            'prob_above_baseline':  prob_above_baseline,
            'confidence_band_90':   [pct_values.get('5'),  pct_values.get('95')],
            'confidence_band_50':   [pct_values.get('25'), pct_values.get('75')],
            'samples':              [round(float(x), 4) for x in composite_arr[:200]],
        })
    except Exception as e:
        import traceback
        return jsonify({'error': str(e), 'trace': traceback.format_exc()}), 500


@app.route('/prophet-forecast', methods=['POST'])
def prophet_forecast():
    try:
        from prophet import Prophet
        data = request.json
        rows = data.get('rows', [])
        date_col = data.get('date_col')
        value_col = data.get('value_col')
        periods = int(data.get('periods', 30))
        freq = data.get('freq', 'D')

        if not rows or not date_col or not value_col:
            return jsonify({'error': 'rows, date_col, value_col required'}), 400

        df = pd.DataFrame(rows)
        df = df[[date_col, value_col]].rename(columns={date_col: 'ds', value_col: 'y'})
        df['ds'] = pd.to_datetime(df['ds'], errors='coerce')
        df['y'] = pd.to_numeric(df['y'], errors='coerce')
        df = df.dropna()

        if len(df) < 10:
            return jsonify({'error': 'Need at least 10 data points for forecasting'}), 400

        model = Prophet(daily_seasonality=False, weekly_seasonality=True, yearly_seasonality=True)
        model.fit(df)

        future = model.make_future_dataframe(periods=periods, freq=freq)
        forecast = model.predict(future)

        return jsonify({
            'forecast': forecast[['ds', 'yhat', 'yhat_lower', 'yhat_upper']].tail(periods + len(df)).assign(ds=lambda x: x['ds'].dt.strftime('%Y-%m-%d')).to_dict(orient='records'),
            'historical': df.assign(ds=lambda x: x['ds'].dt.strftime('%Y-%m-%d')).to_dict(orient='records'),
            'components': {
                'trend': forecast[['ds', 'trend']].assign(ds=lambda x: x['ds'].dt.strftime('%Y-%m-%d')).to_dict(orient='records'),
            },
            'periods': periods,
            'model': 'Prophet',
        })
    except ImportError:
        return jsonify({'error': 'Prophet not installed'}), 501
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/prescriptive', methods=['POST'])
def prescriptive():
    try:
        data = request.json
        rows = data.get('rows', [])
        target_col = data.get('target_col')
        optimize_for = data.get('optimize_for', 'maximize')
        feature_cols = data.get('feature_cols', [])

        if not rows:
            return jsonify({'error': 'rows required'}), 400

        df = df_from_rows(rows)

        # Auto-select first numeric column when target_col not provided
        if not target_col:
            num_cols = df.select_dtypes(include=[np.number]).columns.tolist()
            if not num_cols:
                for c in df.columns:
                    if not pd.to_numeric(df[c], errors='coerce').isna().all():
                        num_cols.append(c)
            target_col = num_cols[0] if num_cols else None
            if not target_col:
                return jsonify({'error': 'No numeric columns found; provide target_col'}), 400

        if target_col not in df.columns:
            return jsonify({'error': f'Column {target_col} not found'}), 400

        # Coerce target to numeric — give a clear error if it's a text column
        df[target_col] = pd.to_numeric(df[target_col], errors='coerce')
        if df[target_col].isna().all():
            return jsonify({
                'error': f'"{target_col}" is a text column and cannot be optimized. '
                         'Please select a numeric column (e.g. revenue, price, count).'
            }), 400

        numeric_cols = [c for c in df.select_dtypes(include=[np.number]).columns if c != target_col]

        # Keep only user-selected columns that actually exist AND are numeric
        if feature_cols:
            # Try coercing user-selected cols; keep ones that become numeric
            coerced = []
            for c in feature_cols:
                if c in df.columns and c != target_col:
                    df[c] = pd.to_numeric(df[c], errors='coerce')
                    if not df[c].isna().all():
                        coerced.append(c)
            feature_cols = coerced if coerced else numeric_cols[:8]
        else:
            feature_cols = numeric_cols[:8]

        if not feature_cols:
            return jsonify({'error': 'No usable numeric feature columns found. '
                                     'Your dataset needs at least one numeric column besides the target.'}), 400

        df_clean = df[feature_cols + [target_col]].dropna()
        if len(df_clean) < 10:
            return jsonify({'error': 'Insufficient data after cleaning (need ≥ 10 rows with non-null numeric values)'}), 400

        X = df_clean[feature_cols]
        y = df_clean[target_col]

        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)

        model = RandomForestRegressor(n_estimators=100, random_state=42)
        model.fit(X_scaled, y)

        importances = pd.Series(model.feature_importances_, index=feature_cols).sort_values(ascending=False)

        # Generate recommendations
        recommendations = []
        best_row = df_clean.loc[df_clean[target_col].idxmax() if optimize_for == 'maximize' else df_clean[target_col].idxmin()]
        current_mean = float(y.mean())
        current_best = float(y.max() if optimize_for == 'maximize' else y.min())

        for feat in importances.head(5).index:
            feat_importance = float(importances[feat])
            best_val = float(best_row[feat])
            current_val = float(df_clean[feat].mean())
            direction = 'increase' if best_val > current_val else 'decrease'
            pct_change = abs(best_val - current_val) / (abs(current_val) + 1e-9) * 100

            recommendations.append({
                'feature': feat,
                'importance': round(feat_importance, 4),
                'action': f'{direction.capitalize()} "{feat}" by ~{pct_change:.1f}%',
                'current_avg': round(current_val, 4),
                'optimal_value': round(best_val, 4),
                'expected_impact': f'Potential {optimize_for} of {target_col}',
            })

        # What-if prediction
        optimal_X = df_clean[feature_cols].copy()
        for feat in importances.head(3).index:
            if optimize_for == 'maximize':
                optimal_X[feat] = df_clean[feat].quantile(0.9)
            else:
                optimal_X[feat] = df_clean[feat].quantile(0.1)

        predicted_optimal = float(model.predict(scaler.transform(optimal_X)).mean())

        return jsonify({
            'target': target_col,
            'optimize_for': optimize_for,
            'current_mean': round(current_mean, 4),
            'current_best': round(current_best, 4),
            'predicted_optimal': round(predicted_optimal, 4),
            'improvement_pct': round((predicted_optimal - current_mean) / (abs(current_mean) + 1e-9) * 100, 2),
            'feature_importance': importances.round(4).to_dict(),
            'recommendations': recommendations,
            'model': 'RandomForest',
            'rows_used': len(df_clean),
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/root-cause', methods=['POST'])
def root_cause():
    try:
        data = request.json
        rows = data.get('rows', [])
        target_col = data.get('target_col')
        segment_col = data.get('segment_col')

        if not rows:
            return jsonify({'error': 'rows required'}), 400

        df = df_from_rows(rows)

        # Auto-select first numeric column when target_col not provided
        if not target_col:
            num_cols = df.select_dtypes(include=[np.number]).columns.tolist()
            if not num_cols:
                for c in df.columns:
                    if not pd.to_numeric(df[c], errors='coerce').isna().all():
                        num_cols.append(c)
            target_col = num_cols[0] if num_cols else None
            if not target_col:
                return jsonify({'error': 'No numeric columns found; provide target_col'}), 400

        if target_col not in df.columns:
            return jsonify({'error': f'Column {target_col} not found'}), 400

        numeric_cols = [c for c in df.select_dtypes(include=[np.number]).columns if c != target_col]
        y = pd.to_numeric(df[target_col], errors='coerce').dropna()

        q1, q3 = y.quantile(0.25), y.quantile(0.75)
        iqr = q3 - q1
        outlier_mask = (y < q1 - 1.5 * iqr) | (y > q3 + 1.5 * iqr)

        # Correlation analysis
        correlations = {}
        for col in numeric_cols[:10]:
            try:
                corr_df = df[[col, target_col]].apply(pd.to_numeric, errors='coerce').dropna()
                if len(corr_df) > 5:
                    r = float(corr_df.corr().iloc[0, 1])
                    if not np.isnan(r):
                        correlations[col] = round(r, 4)
            except:
                pass

        sorted_corr = dict(sorted(correlations.items(), key=lambda x: abs(x[1]), reverse=True))

        # Segment analysis
        segment_analysis = {}
        if segment_col and segment_col in df.columns:
            for seg_val, group in df.groupby(segment_col):
                seg_target = pd.to_numeric(group[target_col], errors='coerce').dropna()
                if len(seg_target) > 0:
                    segment_analysis[str(seg_val)] = {
                        'mean': round(float(seg_target.mean()), 4),
                        'count': len(seg_target),
                        'pct_of_total': round(len(seg_target) / len(df) * 100, 1),
                    }

        return jsonify({
            'target': target_col,
            'overall_mean': round(float(y.mean()), 4),
            'overall_std': round(float(y.std()), 4),
            'outlier_count': int(outlier_mask.sum()),
            'outlier_pct': round(float(outlier_mask.mean() * 100), 2),
            'top_correlations': sorted_corr,
            'segment_analysis': segment_analysis,
            'distribution': {
                'q1': round(float(q1), 4),
                'median': round(float(y.median()), 4),
                'q3': round(float(q3), 4),
                'skewness': round(float(y.skew()), 4),
                'kurtosis': round(float(y.kurt()), 4),
            },
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/automl', methods=['POST'])
def automl():
    """
    Enterprise AutoML: trains 8 models (Random Forest, Gradient Boosting,
    XGBoost, Neural Network/MLP, Logistic/Ridge/Lasso/SVM), selects the winner
    by cross-validated score, and returns per-model metrics + feature importance.
    """
    try:
        from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
        from sklearn.ensemble import GradientBoostingClassifier, GradientBoostingRegressor
        from sklearn.linear_model import LogisticRegression, Ridge, Lasso
        from sklearn.svm import SVC, SVR
        from sklearn.neural_network import MLPClassifier, MLPRegressor
        from sklearn.model_selection import cross_val_score
        from sklearn.preprocessing import LabelEncoder, StandardScaler

        body = request.get_json()
        data = body.get('data', [])
        target_col = body.get('target_col')
        feature_cols = body.get('feature_cols', [])
        task_type = body.get('task_type', 'classification')

        df = df_from_rows(data)
        if target_col not in df.columns:
            return jsonify({'error': f'Target column "{target_col}" not found'}), 400

        if not feature_cols:
            feature_cols = [c for c in df.columns if c != target_col]

        # Only keep numeric-ish feature cols (encode objects)
        valid_feature_cols = [c for c in feature_cols if c in df.columns]
        df_clean = df[valid_feature_cols + [target_col]].dropna()
        if len(df_clean) < 20:
            return jsonify({'error': 'Need at least 20 rows for AutoML'}), 400

        X = df_clean[valid_feature_cols].copy()
        y = df_clean[target_col].copy()

        # Encode categoricals in X
        encoders = {}
        for col in X.columns:
            if X[col].dtype == object or not pd.api.types.is_numeric_dtype(X[col]):
                le = LabelEncoder()
                X[col] = le.fit_transform(X[col].astype(str))
                encoders[col] = list(le.classes_)

        X = X.apply(pd.to_numeric, errors='coerce').fillna(0)

        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)

        # ── Try XGBoost ────────────────────────────────────────────────────
        xgb_cls, xgb_reg = None, None
        try:
            import xgboost as xgb
            xgb_cls = xgb.XGBClassifier(n_estimators=50, max_depth=4, random_state=42,
                                         use_label_encoder=False, eval_metric='logloss', verbosity=0)
            xgb_reg = xgb.XGBRegressor(n_estimators=50, max_depth=4, random_state=42, verbosity=0)
        except ImportError:
            pass

        if task_type == 'classification':
            y_enc = LabelEncoder()
            y = y_enc.fit_transform(y.astype(str))
            models = {
                'Random Forest':       (RandomForestClassifier(n_estimators=60, random_state=42), X),
                'Gradient Boosting':   (GradientBoostingClassifier(n_estimators=60, random_state=42), X),
                'Logistic Regression': (LogisticRegression(max_iter=500, random_state=42), X_scaled),
                'Neural Network':      (MLPClassifier(hidden_layer_sizes=(64, 32), max_iter=200, random_state=42), X_scaled),
                'SVM':                 (SVC(kernel='rbf', random_state=42), X_scaled),
            }
            if xgb_cls:
                models['XGBoost'] = (xgb_cls, X)
            scoring = 'accuracy'
        else:
            y = pd.to_numeric(y, errors='coerce').fillna(float(y.mode()[0]) if not pd.to_numeric(y, errors='coerce').notna().all() else 0)
            models = {
                'Random Forest':     (RandomForestRegressor(n_estimators=60, random_state=42), X),
                'Gradient Boosting': (GradientBoostingRegressor(n_estimators=60, random_state=42), X),
                'Ridge Regression':  (Ridge(), X_scaled),
                'Lasso Regression':  (Lasso(), X_scaled),
                'Neural Network':    (MLPRegressor(hidden_layer_sizes=(64, 32), max_iter=200, random_state=42), X_scaled),
            }
            if xgb_reg:
                models['XGBoost'] = (xgb_reg, X)
            scoring = 'r2'

        all_scores = {}
        model_details = {}
        best_model_name = None
        best_score = -999
        cv_folds = max(2, min(5, len(df_clean) // 10))

        for name, (model, use_X) in models.items():
            try:
                cv_scores = cross_val_score(model, use_X, y, cv=cv_folds, scoring=scoring, n_jobs=-1)
                mean_score = float(np.mean(cv_scores))
                std_score = float(np.std(cv_scores))
                all_scores[name] = round(mean_score, 4)
                model_details[name] = {
                    'mean': round(mean_score, 4),
                    'std': round(std_score, 4),
                    'cv_scores': [round(float(s), 4) for s in cv_scores],
                    'cv_folds': cv_folds,
                }
                if mean_score > best_score:
                    best_score = mean_score
                    best_model_name = name
            except Exception as model_err:
                all_scores[name] = None
                model_details[name] = {'error': str(model_err)}

        # ── Fit winner for feature importance ─────────────────────────────
        feature_importance = {}
        if best_model_name:
            best_model_obj, use_X_fi = models[best_model_name]
            try:
                best_model_obj.fit(use_X_fi, y)
                if hasattr(best_model_obj, 'feature_importances_'):
                    fi = best_model_obj.feature_importances_
                    total = fi.sum() or 1
                    feature_importance = {col: round(float(imp / total), 4) for col, imp in zip(valid_feature_cols, fi)}
                elif hasattr(best_model_obj, 'coef_'):
                    coef = np.abs(best_model_obj.coef_).flatten() if best_model_obj.coef_.ndim > 1 else np.abs(best_model_obj.coef_)
                    total = coef.sum() or 1
                    feature_importance = {col: round(float(imp / total), 4) for col, imp in zip(valid_feature_cols, coef)}
            except Exception:
                pass

        # ── Runner-up gap ──────────────────────────────────────────────────
        ranked = sorted([(n, s) for n, s in all_scores.items() if s is not None], key=lambda x: x[1], reverse=True)
        winner_gap = None
        if len(ranked) >= 2:
            winner_gap = round(float(ranked[0][1] - ranked[1][1]), 4)

        return jsonify({
            'task_type': task_type,
            'best_model': best_model_name,
            'best_score': round(best_score, 4),
            'metric': scoring,
            'all_scores': all_scores,
            'model_details': model_details,
            'feature_importance': feature_importance,
            'sample_size': len(df_clean),
            'features_used': valid_feature_cols,
            'cv_folds': cv_folds,
            'winner_gap': winner_gap,
            'models_compared': len(models),
            'recommendation': f'Best: {best_model_name} ({scoring}={round(best_score, 3)}). {"Accuracy ≥0.8 is strong." if scoring=="accuracy" else "R² ≥0.7 is strong."}'
        })
    except Exception as e:
        import traceback
        return jsonify({'error': str(e), 'trace': traceback.format_exc()}), 500


@app.route('/anomaly-stream', methods=['POST'])
def anomaly_stream():
    try:
        body = request.get_json()
        data = body.get('data', [])
        threshold = float(body.get('threshold', 2.5))
        window = int(body.get('window', 10))

        if not data:
            return jsonify({'error': 'data array required'}), 400

        series = np.array([float(x) for x in data], dtype=float)
        anomalies = []
        scores = []

        for i in range(len(series)):
            start = max(0, i - window)
            window_data = series[start:i + 1]
            mean = float(np.mean(window_data))
            std = float(np.std(window_data)) if len(window_data) > 1 else 0.0
            z = abs(series[i] - mean) / (std + 1e-9)
            scores.append(round(float(z), 4))
            if z > threshold:
                anomalies.append({
                    'index': i,
                    'value': float(series[i]),
                    'z_score': round(float(z), 4),
                    'window_mean': round(mean, 4),
                    'window_std': round(std, 4),
                })

        return jsonify({
            'total_points': len(series),
            'anomalies_found': len(anomalies),
            'anomaly_rate': round(len(anomalies) / max(len(series), 1) * 100, 2),
            'anomalies': anomalies[:100],
            'scores': scores[:500],
            'threshold': threshold,
            'window': window,
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/geo-cluster', methods=['POST'])
def geo_cluster():
    try:
        body = request.get_json()
        points = body.get('points', [])
        n_clusters = int(body.get('n_clusters', 5))
        algorithm = body.get('algorithm', 'kmeans')

        if not points:
            return jsonify({'error': 'points array required'}), 400

        coords = np.array([[p['lat'], p['lng']] for p in points], dtype=float)

        if algorithm == 'dbscan':
            eps = float(body.get('eps', 0.5))
            model = DBSCAN(eps=eps, min_samples=3)
        else:
            model = KMeans(n_clusters=min(n_clusters, len(coords)), random_state=42, n_init=10)

        labels = model.fit_predict(coords)
        unique_labels, counts = np.unique(labels, return_counts=True)

        clusters = {}
        for label, count in zip(unique_labels.tolist(), counts.tolist()):
            mask = labels == label
            cluster_coords = coords[mask]
            clusters[int(label)] = {
                'size': count,
                'centroid': {
                    'lat': round(float(cluster_coords[:, 0].mean()), 6),
                    'lng': round(float(cluster_coords[:, 1].mean()), 6),
                },
                'bbox': {
                    'min_lat': round(float(cluster_coords[:, 0].min()), 6),
                    'max_lat': round(float(cluster_coords[:, 0].max()), 6),
                    'min_lng': round(float(cluster_coords[:, 1].min()), 6),
                    'max_lng': round(float(cluster_coords[:, 1].max()), 6),
                }
            }

        labeled_points = [
            {**p, 'cluster': int(labels[i])}
            for i, p in enumerate(points)
        ]

        return jsonify({
            'algorithm': algorithm,
            'n_clusters': len(unique_labels),
            'clusters': clusters,
            'points': labeled_points,
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/pivot-compute', methods=['POST'])
def pivot_compute():
    try:
        body = request.get_json()
        data = body.get('data', [])
        row_fields = body.get('rows', [])
        col_fields = body.get('cols', [])
        value_field = body.get('value')
        agg = body.get('agg', 'sum')

        if not data or not value_field:
            return jsonify({'error': 'data and value field required'}), 400

        df = df_from_rows(data)
        if value_field not in df.columns:
            return jsonify({'error': f'Column {value_field} not found'}), 400

        group_fields = row_fields + col_fields
        if not group_fields:
            group_fields = [df.columns[0]]

        valid_cols = [c for c in group_fields if c in df.columns]
        if not valid_cols:
            return jsonify({'error': 'No valid grouping columns found'}), 400

        agg_map = {'sum': 'sum', 'mean': 'mean', 'count': 'count', 'min': 'min', 'max': 'max', 'median': 'median'}
        agg_fn = agg_map.get(agg, 'sum')

        grouped = df.groupby(valid_cols)[value_field].agg(agg_fn).reset_index()

        result_rows = []
        for _, row in grouped.iterrows():
            r = {}
            for c in valid_cols:
                val = row[c]
                r[c] = val if not (hasattr(val, 'item') and callable(val.item)) else val.item()
            val = row[value_field]
            r[value_field] = round(float(val), 4) if not np.isnan(float(val)) else 0
            result_rows.append(r)

        total = float(df[value_field].agg(agg_fn)) if agg_fn != 'count' else len(df)

        return jsonify({
            'rows': result_rows,
            'total': round(total, 4),
            'groupBy': valid_cols,
            'valueField': value_field,
            'aggregation': agg,
            'rowCount': len(result_rows)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/anomaly/multi-method', methods=['POST'])
def anomaly_multi_method():
    """
    Enterprise multi-method anomaly detection.
    Runs Z-score, IQR, Isolation Forest, and DBSCAN simultaneously.
    Returns per-row confidence scores (fraction of methods agreeing),
    chart-ready series for each numeric column, and column-level summaries.
    """
    try:
        body = request.get_json()
        rows = body.get('rows', [])
        columns = body.get('columns', [])  # specific columns to analyze, or all numeric
        target_col = body.get('target_col')  # primary column for time-series chart
        zscore_threshold = float(body.get('zscore_threshold', 3.0))
        contamination = float(body.get('contamination', 0.05))  # expected anomaly fraction

        if not rows:
            return jsonify({'error': 'rows array required'}), 400

        df = df_from_rows(rows)

        if columns:
            numeric_cols = [c for c in columns if c in df.columns and pd.api.types.is_numeric_dtype(df[c])]
        else:
            numeric_cols = list(df.select_dtypes(include=[np.number]).columns)

        if not numeric_cols:
            return jsonify({'error': 'No numeric columns found for anomaly detection'}), 400

        # Cap for performance
        df = df.head(5000).copy()
        n = len(df)

        # ── Method 1: Z-score ─────────────────────────────────────────────────
        zscore_flags = np.zeros(n, dtype=bool)
        zscore_values = {}
        col_stats = {}

        for col in numeric_cols:
            vals = pd.to_numeric(df[col], errors='coerce').fillna(df[col].median() if not df[col].isna().all() else 0)
            mean = vals.mean()
            std = vals.std()
            if std < 1e-9:
                zs = np.zeros(n)
            else:
                zs = np.abs((vals - mean) / std)
            col_flags = zs > zscore_threshold
            zscore_flags |= col_flags
            zscore_values[col] = zs.round(4).tolist()
            q1, q3 = vals.quantile(0.25), vals.quantile(0.75)
            col_stats[col] = {
                'mean': round(float(mean), 4),
                'std': round(float(std), 4),
                'min': round(float(vals.min()), 4),
                'max': round(float(vals.max()), 4),
                'q1': round(float(q1), 4),
                'q3': round(float(q3), 4),
                'iqr': round(float(q3 - q1), 4),
                'zscore_threshold': zscore_threshold,
            }

        # ── Method 2: IQR ─────────────────────────────────────────────────────
        iqr_flags = np.zeros(n, dtype=bool)
        for col in numeric_cols:
            vals = pd.to_numeric(df[col], errors='coerce').fillna(col_stats[col]['mean'])
            q1, q3, iqr = col_stats[col]['q1'], col_stats[col]['q3'], col_stats[col]['iqr']
            if iqr < 1e-9:
                continue
            col_flags = (vals < q1 - 1.5 * iqr) | (vals > q3 + 1.5 * iqr)
            iqr_flags |= col_flags

        # ── Method 3: Isolation Forest ────────────────────────────────────────
        iso_flags = np.zeros(n, dtype=bool)
        iso_scores = np.zeros(n)
        try:
            X = df[numeric_cols].apply(pd.to_numeric, errors='coerce').fillna(0)
            scaler = StandardScaler()
            X_s = scaler.fit_transform(X)
            iso = IsolationForest(contamination=contamination, random_state=42, n_jobs=-1)
            iso_preds = iso.fit_predict(X_s)
            iso_scores = iso.decision_function(X_s)
            iso_flags = iso_preds == -1
        except Exception:
            pass

        # ── Method 4: DBSCAN ─────────────────────────────────────────────────
        dbscan_flags = np.zeros(n, dtype=bool)
        try:
            X = df[numeric_cols].apply(pd.to_numeric, errors='coerce').fillna(0)
            scaler2 = StandardScaler()
            X_s2 = scaler2.fit_transform(X)
            db = DBSCAN(eps=0.8, min_samples=max(3, int(n * 0.01)))
            db_labels = db.fit_predict(X_s2)
            dbscan_flags = db_labels == -1
        except Exception:
            pass

        # ── Aggregate: confidence = fraction of methods agreeing ──────────────
        methods_matrix = np.stack([zscore_flags, iqr_flags, iso_flags, dbscan_flags], axis=1)
        confidence = methods_matrix.mean(axis=1)  # 0.0 – 1.0
        is_anomaly = confidence >= 0.5  # majority vote

        # ── Build anomaly records ─────────────────────────────────────────────
        anomaly_records = []
        for i in np.where(is_anomaly)[0]:
            row_dict = {k: (v.item() if hasattr(v, 'item') else v) for k, v in df.iloc[i].items()}
            methods_hit = []
            if zscore_flags[i]: methods_hit.append('zscore')
            if iqr_flags[i]: methods_hit.append('iqr')
            if iso_flags[i]: methods_hit.append('isolation_forest')
            if dbscan_flags[i]: methods_hit.append('dbscan')

            # Which columns triggered z-score
            affected_cols = [c for c in numeric_cols if zscore_values[c][i] > zscore_threshold]

            anomaly_records.append({
                'row_index': int(i),
                'confidence': round(float(confidence[i]), 4),
                'methods_detected': methods_hit,
                'columns_affected': affected_cols,
                'isolation_score': round(float(iso_scores[i]), 4),
                'zscore_by_col': {c: round(float(zscore_values[c][i]), 3) for c in numeric_cols[:5]},
                'row': row_dict,
            })

        # Sort by confidence desc
        anomaly_records.sort(key=lambda x: x['confidence'], reverse=True)

        # ── Chart series for primary (or first) column ────────────────────────
        chart_col = target_col if target_col and target_col in numeric_cols else numeric_cols[0]
        vals = pd.to_numeric(df[chart_col], errors='coerce').fillna(0)
        series = []
        for i, v in enumerate(vals.values):
            series.append({
                'index': i,
                'value': round(float(v), 4),
                'is_anomaly': bool(is_anomaly[i]),
                'confidence': round(float(confidence[i]), 4),
                'zscore': round(float(zscore_values[chart_col][i]), 3),
            })

        # ── Column-level anomaly breakdown ────────────────────────────────────
        col_anomaly_counts = {}
        for col in numeric_cols:
            col_anomaly_counts[col] = int(sum(1 for i in range(n) if zscore_values[col][i] > zscore_threshold))

        return jsonify({
            'methods': ['zscore', 'iqr', 'isolation_forest', 'dbscan'],
            'summary': {
                'total_rows': n,
                'anomalies_found': int(is_anomaly.sum()),
                'anomaly_rate': round(float(is_anomaly.mean() * 100), 2),
                'high_confidence': int((confidence >= 0.75).sum()),
                'medium_confidence': int(((confidence >= 0.5) & (confidence < 0.75)).sum()),
                'methods_agreement': {
                    'zscore_flagged': int(zscore_flags.sum()),
                    'iqr_flagged': int(iqr_flags.sum()),
                    'isolation_forest_flagged': int(iso_flags.sum()),
                    'dbscan_flagged': int(dbscan_flags.sum()),
                },
                'column_anomaly_counts': col_anomaly_counts,
                'chart_column': chart_col,
            },
            'anomalies': anomaly_records[:200],
            'series': series,
            'col_stats': col_stats,
            'numeric_cols': numeric_cols,
        })
    except Exception as e:
        import traceback
        return jsonify({'error': str(e), 'trace': traceback.format_exc()}), 500


@app.route('/check-syntax', methods=['POST'])
def check_syntax():
    try:
        from checker import run_checks
        body = request.get_json() or {}
        language = body.get('language', 'sql')
        code = body.get('code', '')
        if not code:
            return jsonify({'errors': [], 'count': 0})
        errors = run_checks(language, code)
        return jsonify({'errors': errors, 'count': len(errors), 'language': language})
    except Exception as e:
        import traceback
        return jsonify({'error': str(e), 'trace': traceback.format_exc()}), 500


# ── Explainable AI (SHAP-style permutation importance) ────────────────────────
@app.route('/explain', methods=['POST'])
def explain():
    try:
        from sklearn.inspection import permutation_importance as sk_perm_imp
        from sklearn.ensemble import GradientBoostingClassifier, GradientBoostingRegressor
        body = request.get_json() or {}
        rows = body.get('rows', [])
        target_col = body.get('target_col', '')
        feature_cols = body.get('feature_cols', [])
        task_type = body.get('task_type', 'auto')

        df = pd.DataFrame(rows)
        validate_df(df, min_rows=10, context='explain')
        if target_col not in df.columns:
            return jsonify({'error': f'Target column "{target_col}" not found'}), 400

        df = df.dropna(subset=[target_col])
        if not feature_cols:
            feature_cols = [c for c in df.columns if c != target_col]
        feature_cols = [c for c in feature_cols if c in df.columns]

        X = df[feature_cols].copy()
        y = df[target_col].copy()
        for col in X.select_dtypes(include='object').columns:
            X[col] = LabelEncoder().fit_transform(X[col].astype(str))
        X = X.fillna(X.mean(numeric_only=True)).fillna(0)

        unique_vals = y.nunique()
        if task_type == 'auto':
            task_type = 'classification' if (unique_vals <= 10 or not pd.to_numeric(y, errors='coerce').notna().all()) else 'regression'

        if task_type == 'classification':
            le_y = LabelEncoder()
            y_enc = le_y.fit_transform(y.astype(str))
            model = RandomForestClassifier(n_estimators=80, random_state=42)
        else:
            y_enc = pd.to_numeric(y, errors='coerce').fillna(0).values
            model = RandomForestRegressor(n_estimators=80, random_state=42)

        model.fit(X, y_enc)

        # Global feature importance (MDI)
        importances = model.feature_importances_
        global_importance = sorted([
            {'feature': col, 'importance': round(float(imp), 4), 'pct': round(float(imp) * 100, 2)}
            for col, imp in zip(feature_cols, importances)
        ], key=lambda x: x['importance'], reverse=True)

        # Permutation importance on a validation sample
        n_sample = min(300, len(X))
        X_s = X.iloc[:n_sample]
        y_s = y_enc[:n_sample]
        perm = sk_perm_imp(model, X_s, y_s, n_repeats=5, random_state=42)
        perm_importance = sorted([
            {'feature': col, 'importance': round(float(m), 4), 'std': round(float(s), 4)}
            for col, m, s in zip(feature_cols, perm.importances_mean, perm.importances_std)
        ], key=lambda x: x['importance'], reverse=True)

        # Local explanations for first 5 rows (counterfactual mean-substitution)
        local_explanations = []
        X_means = X.mean()
        for i in range(min(5, len(X))):
            row_x = X.iloc[[i]]
            pred = float(model.predict(row_x)[0])
            contribs = []
            for col in feature_cols:
                perturbed = row_x.copy()
                perturbed[col] = float(X_means[col])
                delta = pred - float(model.predict(perturbed)[0])
                contribs.append({'feature': col, 'value': float(row_x[col].iloc[0]), 'contribution': round(delta, 4)})
            contribs.sort(key=lambda x: abs(x['contribution']), reverse=True)
            local_explanations.append({
                'row': i,
                'prediction': round(pred, 4),
                'actual': str(df[target_col].iloc[i]),
                'contributions': contribs[:8],
            })

        # Partial dependence for top 3 features
        top3 = [g['feature'] for g in global_importance[:3]]
        partial_dependence = {}
        for feat in top3:
            feat_min, feat_max = float(X[feat].min()), float(X[feat].max())
            if feat_min == feat_max:
                continue
            vals = np.linspace(feat_min, feat_max, 20)
            X_tmp = X.copy()
            pdp = []
            for v in vals:
                X_tmp[feat] = v
                pdp.append(round(float(model.predict(X_tmp).mean()), 4))
            partial_dependence[feat] = [{'x': round(float(v), 4), 'y': p} for v, p in zip(vals, pdp)]

        return jsonify({
            'global_importance': global_importance,
            'permutation_importance': perm_importance,
            'local_explanations': local_explanations,
            'partial_dependence': partial_dependence,
            'model': 'RandomForest',
            'task_type': task_type,
            'n_features': len(feature_cols),
            'n_rows': len(df),
        })
    except Exception as e:
        import traceback
        return jsonify({'error': str(e), 'trace': traceback.format_exc()}), 500


# ── Bias & Fairness Checks ────────────────────────────────────────────────────
@app.route('/bias-check', methods=['POST'])
def bias_check():
    try:
        body = request.get_json() or {}
        rows = body.get('rows', [])
        target_col = body.get('target_col', '')
        protected_col = body.get('protected_col', '')
        feature_cols = body.get('feature_cols', [])

        df = pd.DataFrame(rows)
        validate_df(df, min_rows=20, context='bias_check')
        if target_col not in df.columns:
            return jsonify({'error': f'Target column "{target_col}" not found'}), 400
        if protected_col not in df.columns:
            return jsonify({'error': f'Protected column "{protected_col}" not found'}), 400

        df = df.dropna(subset=[target_col, protected_col]).copy()
        if not feature_cols:
            feature_cols = [c for c in df.columns if c not in [target_col, protected_col]]
        feature_cols = [c for c in feature_cols if c in df.columns]

        X = df[feature_cols].copy()
        for col in X.select_dtypes(include='object').columns:
            X[col] = LabelEncoder().fit_transform(X[col].astype(str))
        X = X.fillna(X.mean(numeric_only=True)).fillna(0)

        le_y = LabelEncoder()
        y_enc = le_y.fit_transform(df[target_col].astype(str))
        model = RandomForestClassifier(n_estimators=80, random_state=42)
        model.fit(X, y_enc)
        y_pred = model.predict(X)

        groups = df[protected_col].unique()
        group_metrics = []
        for grp in groups:
            mask = (df[protected_col] == grp).values
            grp_y = y_enc[mask]
            grp_pred = y_pred[mask]
            if len(grp_pred) == 0:
                continue
            pos_rate = float(grp_pred.mean())
            tpr = float(((grp_pred == 1) & (grp_y == 1)).sum() / grp_y.sum()) if grp_y.sum() > 0 else 0.0
            acc = float((grp_pred == grp_y).mean())
            group_metrics.append({
                'group': str(grp),
                'count': int(mask.sum()),
                'positive_rate': round(pos_rate, 4),
                'true_positive_rate': round(tpr, 4),
                'accuracy': round(acc, 4),
            })

        pos_rates = [g['positive_rate'] for g in group_metrics]
        tprs = [g['true_positive_rate'] for g in group_metrics]
        max_pos, min_pos = (max(pos_rates), min(pos_rates)) if pos_rates else (1, 1)
        disparate_impact = round(min_pos / max_pos, 4) if max_pos > 0 else 1.0
        dp_diff = round(max_pos - min_pos, 4)
        eo_diff = round(max(tprs) - min(tprs), 4) if len(tprs) > 1 else 0.0

        fairness_score = int(max(0, min(100, 100 - dp_diff * 100 - eo_diff * 50)))
        verdict = 'FAIR' if disparate_impact >= 0.8 and dp_diff < 0.1 else ('POTENTIAL_BIAS' if disparate_impact >= 0.6 else 'BIASED')

        recs = []
        if disparate_impact < 0.8:
            recs.append(f'Disparate impact {disparate_impact:.2f} < 0.8. Reweight samples for "{protected_col}" groups.')
        if dp_diff > 0.1:
            recs.append(f'Demographic parity diff {dp_diff:.2f}. Apply post-processing calibration or fairness-aware algorithm.')
        if eo_diff > 0.1:
            recs.append(f'Equalized odds diff {eo_diff:.2f}. Consider threshold optimization per group.')
        if not recs:
            recs.append('No significant bias detected. Monitor continuously as new data arrives.')

        return jsonify({
            'group_metrics': group_metrics,
            'fairness_summary': {
                'disparate_impact': disparate_impact,
                'demographic_parity_diff': dp_diff,
                'equalized_odds_diff': eo_diff,
                'overall_positive_rate': round(float(y_pred.mean()), 4),
                'fairness_score': fairness_score,
                'verdict': verdict,
            },
            'recommendations': recs,
            'protected_col': protected_col,
            'target_col': target_col,
            'n_groups': len(group_metrics),
            'n_rows': len(df),
        })
    except Exception as e:
        import traceback
        return jsonify({'error': str(e), 'trace': traceback.format_exc()}), 500


# ── Synthetic Data Generator ──────────────────────────────────────────────────
def _get_template_schema(template):
    templates = {
        'sales': [
            {'name': 'sale_id', 'type': 'id', 'params': {'prefix': 'SALE', 'start': 1000}},
            {'name': 'date', 'type': 'date', 'params': {'start': '2024-01-01', 'end': '2024-12-31'}},
            {'name': 'region', 'type': 'categorical', 'params': {'categories': ['North','South','East','West','Central'], 'weights': [0.25,0.20,0.20,0.20,0.15]}},
            {'name': 'product', 'type': 'categorical', 'params': {'categories': ['Widget A','Widget B','Gadget X','Gadget Y','Service Pro']}},
            {'name': 'channel', 'type': 'categorical', 'params': {'categories': ['Online','Retail','Direct','Wholesale']}},
            {'name': 'quantity', 'type': 'integer', 'params': {'distribution': 'poisson', 'lambda': 25}},
            {'name': 'unit_price', 'type': 'float', 'params': {'distribution': 'normal', 'mean': 150, 'std': 80}},
            {'name': 'discount', 'type': 'float', 'params': {'distribution': 'uniform', 'min': 0, 'max': 0.3}},
            {'name': 'revenue', 'type': 'float', 'params': {'distribution': 'normal', 'mean': 5000, 'std': 2000}},
            {'name': 'cost', 'type': 'float', 'params': {'distribution': 'normal', 'mean': 2500, 'std': 1000}},
            {'name': 'profit', 'type': 'float', 'params': {'distribution': 'normal', 'mean': 2500, 'std': 1500}},
            {'name': 'customer_id', 'type': 'integer', 'params': {'distribution': 'uniform', 'min': 1000, 'max': 9999}},
        ],
        'hr': [
            {'name': 'employee_id', 'type': 'id', 'params': {'prefix': 'EMP', 'start': 1001}},
            {'name': 'department', 'type': 'categorical', 'params': {'categories': ['Engineering','Sales','Marketing','HR','Finance','Operations']}},
            {'name': 'job_level', 'type': 'categorical', 'params': {'categories': ['Junior','Mid','Senior','Lead','Manager','Director'], 'weights': [0.25,0.30,0.25,0.10,0.07,0.03]}},
            {'name': 'gender', 'type': 'categorical', 'params': {'categories': ['M','F','Non-binary'], 'weights': [0.52,0.45,0.03]}},
            {'name': 'age', 'type': 'integer', 'params': {'distribution': 'normal', 'mean': 35, 'std': 8}},
            {'name': 'tenure_years', 'type': 'float', 'params': {'distribution': 'exponential', 'scale': 3}},
            {'name': 'salary', 'type': 'float', 'params': {'distribution': 'normal', 'mean': 75000, 'std': 25000}},
            {'name': 'performance_score', 'type': 'float', 'params': {'distribution': 'normal', 'mean': 3.5, 'std': 0.8}},
            {'name': 'attrition', 'type': 'boolean', 'params': {'true_rate': 0.16}},
        ],
        'iot': [
            {'name': 'sensor_id', 'type': 'categorical', 'params': {'categories': [f'SENSOR_{i:03d}' for i in range(1, 21)]}},
            {'name': 'timestamp', 'type': 'date', 'params': {'start': '2024-01-01', 'end': '2024-12-31'}},
            {'name': 'temperature', 'type': 'float', 'params': {'distribution': 'normal', 'mean': 22, 'std': 5}},
            {'name': 'humidity', 'type': 'float', 'params': {'distribution': 'normal', 'mean': 55, 'std': 15}},
            {'name': 'pressure', 'type': 'float', 'params': {'distribution': 'normal', 'mean': 1013, 'std': 10}},
            {'name': 'cpu_usage', 'type': 'float', 'params': {'distribution': 'uniform', 'min': 5, 'max': 95}},
            {'name': 'memory_mb', 'type': 'float', 'params': {'distribution': 'normal', 'mean': 4096, 'std': 1024}},
            {'name': 'alert', 'type': 'boolean', 'params': {'true_rate': 0.05}},
        ],
        'ecommerce': [
            {'name': 'order_id', 'type': 'id', 'params': {'prefix': 'ORD', 'start': 10000}},
            {'name': 'order_date', 'type': 'date', 'params': {'start': '2024-01-01', 'end': '2024-12-31'}},
            {'name': 'customer_segment', 'type': 'categorical', 'params': {'categories': ['New','Returning','VIP','At-Risk'], 'weights': [0.35,0.40,0.15,0.10]}},
            {'name': 'product_category', 'type': 'categorical', 'params': {'categories': ['Electronics','Clothing','Home','Sports','Books','Beauty']}},
            {'name': 'order_value', 'type': 'float', 'params': {'distribution': 'exponential', 'scale': 80}},
            {'name': 'items_count', 'type': 'integer', 'params': {'distribution': 'poisson', 'lambda': 3}},
            {'name': 'shipping_days', 'type': 'integer', 'params': {'distribution': 'uniform', 'min': 1, 'max': 14}},
            {'name': 'returned', 'type': 'boolean', 'params': {'true_rate': 0.12}},
            {'name': 'rating', 'type': 'float', 'params': {'distribution': 'normal', 'mean': 4.0, 'std': 0.8}},
        ],
        'finance': [
            {'name': 'date', 'type': 'date', 'params': {'start': '2024-01-01', 'end': '2024-12-31'}},
            {'name': 'symbol', 'type': 'categorical', 'params': {'categories': ['AAPL','GOOGL','MSFT','AMZN','TSLA','META','NVDA','AMD']}},
            {'name': 'open', 'type': 'float', 'params': {'distribution': 'normal', 'mean': 200, 'std': 50}},
            {'name': 'high', 'type': 'float', 'params': {'distribution': 'normal', 'mean': 210, 'std': 52}},
            {'name': 'low', 'type': 'float', 'params': {'distribution': 'normal', 'mean': 190, 'std': 48}},
            {'name': 'close', 'type': 'float', 'params': {'distribution': 'normal', 'mean': 200, 'std': 50}},
            {'name': 'volume', 'type': 'integer', 'params': {'distribution': 'poisson', 'lambda': 1000000}},
            {'name': 'market_cap_b', 'type': 'float', 'params': {'distribution': 'normal', 'mean': 500, 'std': 300}},
        ],
    }
    return templates.get(template, [])


@app.route('/synthetic/templates', methods=['GET'])
def synthetic_templates():
    return jsonify([
        {'id': 'sales', 'name': 'Sales Data', 'description': '12 columns incl. date, region, product, channel, revenue, profit', 'columns': 12},
        {'id': 'hr', 'name': 'HR Analytics', 'description': '9 columns incl. department, gender, salary, performance, attrition', 'columns': 9},
        {'id': 'iot', 'name': 'IoT Telemetry', 'description': '8 columns incl. sensor_id, temperature, humidity, pressure, alerts', 'columns': 8},
        {'id': 'ecommerce', 'name': 'E-Commerce Orders', 'description': '9 columns incl. segment, category, order_value, rating, returns', 'columns': 9},
        {'id': 'finance', 'name': 'Financial OHLCV', 'description': '8 columns incl. symbol, open, high, low, close, volume', 'columns': 8},
    ])


@app.route('/synthetic/generate', methods=['POST'])
def synthetic_generate():
    try:
        body = request.get_json() or {}
        schema = body.get('schema', [])
        n_rows = min(int(body.get('n_rows', 100)), 50000)
        template = body.get('template')
        seed = int(body.get('seed', 42))
        np.random.seed(seed)

        if template:
            schema = _get_template_schema(template)
        if not schema:
            return jsonify({'error': 'Provide schema array or a template name'}), 400

        col_data = {}
        for spec in schema:
            name = spec.get('name', 'col')
            dtype = spec.get('type', 'numeric')
            dist = spec.get('distribution') or spec.get('params', {}).get('distribution', 'uniform')
            p = spec.get('params', {})

            if dtype in ('numeric', 'integer', 'float'):
                if dist == 'normal':
                    data = np.random.normal(p.get('mean', 0), p.get('std', 1), n_rows)
                elif dist == 'poisson':
                    data = np.random.poisson(p.get('lambda', 5), n_rows).astype(float)
                elif dist == 'exponential':
                    data = np.random.exponential(p.get('scale', 1), n_rows)
                else:
                    data = np.random.uniform(p.get('min', 0), p.get('max', 100), n_rows)
                if dtype == 'integer':
                    data = np.round(data).astype(int).tolist()
                else:
                    data = np.round(data, 4).tolist()
                miss = p.get('missing_rate', 0)
                if miss > 0:
                    for i in range(n_rows):
                        if np.random.random() < miss:
                            data[i] = None
                col_data[name] = data

            elif dtype == 'categorical':
                cats = p.get('categories', ['A', 'B', 'C'])
                wts = p.get('weights')
                if wts:
                    wts = np.array(wts, dtype=float); wts /= wts.sum()
                col_data[name] = np.random.choice(cats, n_rows, p=wts).tolist()

            elif dtype == 'date':
                s = pd.Timestamp(p.get('start', '2024-01-01'))
                e = pd.Timestamp(p.get('end', '2024-12-31'))
                days = max(int((e - s).days), 1)
                offs = np.sort(np.random.randint(0, days, n_rows))
                col_data[name] = [(s + pd.Timedelta(days=int(d))).strftime('%Y-%m-%d') for d in offs]

            elif dtype == 'boolean':
                col_data[name] = (np.random.random(n_rows) < p.get('true_rate', 0.5)).tolist()

            elif dtype == 'id':
                prefix = p.get('prefix', 'ID')
                start_val = int(p.get('start', 1000))
                col_data[name] = [f'{prefix}_{start_val + i}' for i in range(n_rows)]
            else:
                col_data[name] = [f'{name}_{i}' for i in range(n_rows)]

        col_names = list(col_data.keys())
        rows = [{c: col_data[c][i] for c in col_names} for i in range(n_rows)]

        stats = {}
        for spec in schema:
            name = spec.get('name', 'col')
            if name not in col_data:
                continue
            vals = [v for v in col_data[name] if v is not None]
            if spec.get('type') in ('numeric', 'integer', 'float') and vals:
                arr = np.array([float(v) for v in vals])
                stats[name] = {'min': round(float(arr.min()), 2), 'max': round(float(arr.max()), 2), 'mean': round(float(arr.mean()), 2), 'std': round(float(arr.std()), 2)}
            elif vals:
                from collections import Counter
                stats[name] = dict(Counter(str(v) for v in vals).most_common(5))

        return jsonify({'rows': rows, 'n_rows': n_rows, 'schema': schema, 'stats': stats, 'template': template})
    except Exception as e:
        import traceback
        return jsonify({'error': str(e), 'trace': traceback.format_exc()}), 500


# ── Model Performance Benchmark ───────────────────────────────────────────────
@app.route('/benchmark', methods=['POST'])
def benchmark():
    try:
        from sklearn.model_selection import cross_val_score
        from sklearn.svm import SVC, SVR
        from sklearn.ensemble import GradientBoostingClassifier, GradientBoostingRegressor
        from sklearn.linear_model import Ridge, Lasso
        body = request.get_json() or {}
        rows = body.get('rows', [])
        target_col = body.get('target_col', '')
        feature_cols = body.get('feature_cols', [])
        task_type = body.get('task_type', 'auto')

        df = pd.DataFrame(rows)
        validate_df(df, min_rows=10, context='benchmark')
        if target_col not in df.columns:
            return jsonify({'error': f'Target column "{target_col}" not found'}), 400

        df = df.dropna(subset=[target_col])
        if not feature_cols:
            feature_cols = [c for c in df.columns if c != target_col]
        feature_cols = [c for c in feature_cols if c in df.columns]

        X = df[feature_cols].copy()
        y = df[target_col].copy()
        for col in X.select_dtypes(include='object').columns:
            X[col] = LabelEncoder().fit_transform(X[col].astype(str))
        X = X.fillna(X.mean(numeric_only=True)).fillna(0)

        if task_type == 'auto':
            task_type = 'classification' if (y.nunique() <= 10 or not pd.to_numeric(y, errors='coerce').notna().all()) else 'regression'

        if task_type == 'classification':
            y_enc = LabelEncoder().fit_transform(y.astype(str))
            models = {
                'Random Forest': RandomForestClassifier(n_estimators=100, random_state=42),
                'Gradient Boosting': GradientBoostingClassifier(n_estimators=50, random_state=42),
                'Logistic Regression': LogisticRegression(max_iter=300, random_state=42),
                'SVM': SVC(random_state=42),
            }
            scoring = 'accuracy'
        else:
            y_enc = pd.to_numeric(y, errors='coerce').fillna(0).values
            models = {
                'Random Forest': RandomForestRegressor(n_estimators=100, random_state=42),
                'Gradient Boosting': GradientBoostingRegressor(n_estimators=50, random_state=42),
                'Ridge Regression': Ridge(),
                'Lasso Regression': Lasso(),
            }
            scoring = 'r2'

        scaler = StandardScaler()
        X_sc = scaler.fit_transform(X)
        results = []
        for mname, model in models.items():
            t0 = time.time()
            model.fit(X_sc, y_enc)
            fit_t = round(time.time() - t0, 4)

            t0 = time.time()
            model.predict(X_sc[:100])
            pred_t = round(time.time() - t0, 4)

            try:
                cv_n = min(3, max(2, len(X) // 50))
                scores = cross_val_score(model, X_sc, y_enc, cv=cv_n, scoring=scoring)
                cv_mean, cv_std = round(float(scores.mean()), 4), round(float(scores.std()), 4)
            except Exception:
                cv_mean, cv_std = 0.0, 0.0

            results.append({
                'model': mname, 'fit_time_s': fit_t, 'predict_time_s': pred_t,
                'cv_score': cv_mean, 'cv_std': cv_std,
                'rows_per_second': int(len(X) / fit_t) if fit_t > 0 else 0,
            })

        results.sort(key=lambda x: x['cv_score'], reverse=True)
        return jsonify({
            'results': results, 'best_model': results[0]['model'] if results else None,
            'task_type': task_type, 'n_rows': len(df), 'n_features': len(feature_cols), 'metric': scoring,
        })
    except Exception as e:
        import traceback
        return jsonify({'error': str(e), 'trace': traceback.format_exc()}), 500


# ── Causal Inference (ATE via IPW + regression) ───────────────────────────────
@app.route('/causal', methods=['POST'])
def causal():
    try:
        from sklearn.linear_model import LinearRegression
        body = request.get_json() or {}
        rows = body.get('rows', [])
        treatment_col = body.get('treatment_col', '')
        outcome_col = body.get('outcome_col', '')
        control_cols = body.get('control_cols', [])

        df = pd.DataFrame(rows)
        validate_df(df, min_rows=20, context='causal')
        if treatment_col not in df.columns:
            return jsonify({'error': f'Treatment column "{treatment_col}" not found'}), 400
        if outcome_col not in df.columns:
            return jsonify({'error': f'Outcome column "{outcome_col}" not found'}), 400

        df = df.dropna(subset=[treatment_col, outcome_col]).copy()
        if not control_cols:
            control_cols = [c for c in df.columns if c not in [treatment_col, outcome_col]]
        control_cols = [c for c in control_cols if c in df.columns]

        t_vals = pd.to_numeric(df[treatment_col], errors='coerce').fillna(0)
        T = (t_vals > t_vals.median()).astype(int).values
        Y = pd.to_numeric(df[outcome_col], errors='coerce').fillna(0).values

        t_mask = T == 1; c_mask = T == 0
        naive_ate = round(float(Y[t_mask].mean() - Y[c_mask].mean()), 4) if t_mask.sum() > 0 and c_mask.sum() > 0 else 0.0

        ipw_ate, reg_ate = naive_ate, naive_ate
        if control_cols:
            Xc = df[control_cols].copy()
            for col in Xc.select_dtypes(include='object').columns:
                Xc[col] = LabelEncoder().fit_transform(Xc[col].astype(str))
            Xc = Xc.fillna(Xc.mean(numeric_only=True)).fillna(0).values
            try:
                prop = LogisticRegression(max_iter=200, random_state=42)
                prop.fit(Xc, T)
                ps = np.clip(prop.predict_proba(Xc)[:, 1], 0.05, 0.95)
                w = T / ps - (1 - T) / (1 - ps)
                ipw_ate = round(float((w * Y).mean()), 4)
                Xf = np.column_stack([Xc, T.reshape(-1, 1)])
                om = LinearRegression(); om.fit(Xf, Y)
                Xt1 = np.column_stack([Xc, np.ones((len(Xc), 1))])
                Xt0 = np.column_stack([Xc, np.zeros((len(Xc), 1))])
                reg_ate = round(float((om.predict(Xt1) - om.predict(Xt0)).mean()), 4)
            except Exception:
                pass

        boot = []
        for _ in range(300):
            idx = np.random.choice(len(df), len(df), replace=True)
            tb, yb = T[idx], Y[idx]
            if tb.sum() > 0 and (1 - tb).sum() > 0:
                boot.append(yb[tb == 1].mean() - yb[tb == 0].mean())
        ci_low = round(float(np.percentile(boot, 2.5)), 4) if boot else naive_ate
        ci_high = round(float(np.percentile(boot, 97.5)), 4) if boot else naive_ate

        cov_balance = []
        for col in control_cols[:8]:
            if col in df.columns:
                vals = pd.to_numeric(df[col], errors='coerce').fillna(0).values
                tm, cm = float(vals[t_mask].mean()), float(vals[c_mask].mean())
                psd = float(vals.std()) if vals.std() > 0 else 1
                cov_balance.append({
                    'covariate': col, 'treated_mean': round(tm, 4), 'control_mean': round(cm, 4),
                    'std_diff': round((tm - cm) / psd, 4), 'balanced': abs((tm - cm) / psd) < 0.1,
                })

        direction = 'positive' if naive_ate > 0 else ('negative' if naive_ate < 0 else 'neutral')
        interp = (f'Estimated causal effect of "{treatment_col}" on "{outcome_col}": {naive_ate:+.4f} (IPW: {ipw_ate:+.4f}, Regression: {reg_ate:+.4f}). '
                  f'95% CI: [{ci_low:.4f}, {ci_high:.4f}]. Effect is {direction}.')

        return jsonify({
            'treatment_col': treatment_col, 'outcome_col': outcome_col,
            'n_treated': int(t_mask.sum()), 'n_control': int(c_mask.sum()),
            'ate_estimates': {'naive_ate': naive_ate, 'ipw_ate': ipw_ate, 'regression_ate': reg_ate},
            'confidence_interval': {'lower': ci_low, 'upper': ci_high, 'level': 0.95},
            'effect_direction': direction,
            'covariate_balance': cov_balance,
            'interpretation': interp,
        })
    except Exception as e:
        import traceback
        return jsonify({'error': str(e), 'trace': traceback.format_exc()}), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000, debug=False)
