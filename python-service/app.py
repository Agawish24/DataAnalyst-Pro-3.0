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

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000, debug=False)
