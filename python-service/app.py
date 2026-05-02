from flask import Flask, request, jsonify
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
import warnings
warnings.filterwarnings('ignore')

app = Flask(__name__)
CORS(app)

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
        target = body.get('target')
        features = body.get('features', [])
        model_type = body.get('model', 'linear')

        if not target or target not in df.columns:
            return jsonify({'error': f'Target column "{target}" not found'}), 400

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
    try:
        data = request.json
        variables = data.get('variables', [])
        iterations = int(data.get('iterations', 10000))
        iterations = min(iterations, 50000)

        results = []
        np.random.seed(42)
        for _ in range(iterations):
            trial_value = 0
            for var in variables:
                dist = var.get('distribution', 'normal')
                base = float(var.get('baseValue', 1))
                uncertainty = float(var.get('uncertainty', 0.1))
                weight = float(var.get('weight', 1))
                if dist == 'normal':
                    sample = np.random.normal(base, base * uncertainty)
                elif dist == 'uniform':
                    sample = np.random.uniform(base * (1 - uncertainty), base * (1 + uncertainty))
                elif dist == 'triangular':
                    lo, hi = base * (1 - uncertainty), base * (1 + uncertainty)
                    sample = np.random.triangular(lo, base, hi)
                else:
                    sample = base
                trial_value += sample * weight
            results.append(float(trial_value))

        results_arr = np.array(results)
        percentiles = [5, 10, 25, 50, 75, 90, 95]
        hist_counts, hist_edges = np.histogram(results_arr, bins=50)

        return jsonify({
            'iterations': iterations,
            'mean': float(np.mean(results_arr)),
            'std': float(np.std(results_arr)),
            'min': float(np.min(results_arr)),
            'max': float(np.max(results_arr)),
            'percentiles': {str(p): float(np.percentile(results_arr, p)) for p in percentiles},
            'histogram': {
                'counts': hist_counts.tolist(),
                'edges': hist_edges.tolist(),
            },
            'samples': results[:500],
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


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

        if not rows or not target_col:
            return jsonify({'error': 'rows and target_col required'}), 400

        df = df_from_rows(rows)
        if target_col not in df.columns:
            return jsonify({'error': f'Column {target_col} not found'}), 400

        numeric_cols = [c for c in df.select_dtypes(include=[np.number]).columns if c != target_col]
        if not feature_cols:
            feature_cols = numeric_cols[:8]

        feature_cols = [c for c in feature_cols if c in df.columns]
        if not feature_cols:
            return jsonify({'error': 'No usable numeric feature columns'}), 400

        df_clean = df[feature_cols + [target_col]].dropna()
        if len(df_clean) < 10:
            return jsonify({'error': 'Insufficient data after cleaning'}), 400

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

        if not rows or not target_col:
            return jsonify({'error': 'rows and target_col required'}), 400

        df = df_from_rows(rows)
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
    try:
        from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor, GradientBoostingClassifier, GradientBoostingRegressor
        from sklearn.linear_model import LogisticRegression, Ridge, Lasso
        from sklearn.svm import SVC, SVR
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

        df_clean = df[feature_cols + [target_col]].dropna()
        if len(df_clean) < 20:
            return jsonify({'error': 'Need at least 20 rows for AutoML'}), 400

        X = df_clean[feature_cols].copy()
        y = df_clean[target_col].copy()

        # Encode categoricals in X
        le_map = {}
        for col in X.columns:
            if X[col].dtype == object:
                le = LabelEncoder()
                X[col] = le.fit_transform(X[col].astype(str))
                le_map[col] = list(le.classes_)

        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)

        if task_type == 'classification':
            y_enc = LabelEncoder()
            y = y_enc.fit_transform(y.astype(str))
            models = {
                'Random Forest': RandomForestClassifier(n_estimators=50, random_state=42),
                'Gradient Boosting': GradientBoostingClassifier(n_estimators=50, random_state=42),
                'Logistic Regression': LogisticRegression(max_iter=500, random_state=42),
                'SVM': SVC(kernel='rbf', random_state=42),
            }
            scoring = 'accuracy'
        else:
            y = pd.to_numeric(y, errors='coerce').fillna(y.mean())
            models = {
                'Random Forest': RandomForestRegressor(n_estimators=50, random_state=42),
                'Gradient Boosting': GradientBoostingRegressor(n_estimators=50, random_state=42),
                'Ridge Regression': Ridge(),
                'Lasso Regression': Lasso(),
            }
            scoring = 'r2'

        all_scores = {}
        best_model = None
        best_score = -999

        for name, model in models.items():
            try:
                use_X = X_scaled if name in ['Logistic Regression', 'SVM', 'Ridge Regression', 'Lasso Regression'] else X
                cv = min(5, len(df_clean) // 10)
                if cv < 2:
                    cv = 2
                scores = cross_val_score(model, use_X, y, cv=cv, scoring=scoring)
                mean_score = float(np.mean(scores))
                all_scores[name] = round(mean_score, 4)
                if mean_score > best_score:
                    best_score = mean_score
                    best_model = name
            except Exception as e:
                all_scores[name] = None

        # Fit best model for feature importance
        feature_importance = {}
        best_model_obj = models.get(best_model)
        if best_model_obj:
            try:
                use_X = X_scaled if best_model in ['Logistic Regression', 'SVM', 'Ridge Regression', 'Lasso Regression'] else X
                best_model_obj.fit(use_X, y)
                if hasattr(best_model_obj, 'feature_importances_'):
                    fi = best_model_obj.feature_importances_
                    feature_importance = {col: round(float(imp), 4) for col, imp in zip(feature_cols, fi)}
                elif hasattr(best_model_obj, 'coef_'):
                    coef = np.abs(best_model_obj.coef_).flatten() if best_model_obj.coef_.ndim > 1 else np.abs(best_model_obj.coef_)
                    feature_importance = {col: round(float(imp), 4) for col, imp in zip(feature_cols, coef)}
            except Exception:
                pass

        return jsonify({
            'task_type': task_type,
            'best_model': best_model,
            'best_score': round(best_score, 4),
            'metric': scoring,
            'all_scores': all_scores,
            'feature_importance': feature_importance,
            'sample_size': len(df_clean),
            'features_used': feature_cols,
            'recommendation': f'Best model: {best_model} with {scoring}={round(best_score,3)}. {"Accuracy above 0.8 is strong." if scoring=="accuracy" else "R² above 0.7 is strong."}'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000, debug=False)
