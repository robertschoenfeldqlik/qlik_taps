import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import ErrorBoundary from './components/shared/ErrorBoundary';
import ConnectorsPage from './pages/ConnectorsPage';
import BuilderPage from './pages/BuilderPage';
import TapsPage from './pages/TapsPage';
import RunDetailPage from './pages/RunDetailPage';

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/*" element={
          <Layout>
            <Routes>
              <Route path="/" element={<ConnectorsPage />} />
              <Route path="/configs/:id/edit" element={<BuilderPage />} />
              <Route path="/taps" element={<TapsPage />} />
              <Route path="/taps/runs/:id" element={<RunDetailPage />} />
              {/* Redirects for old bookmarks */}
              <Route path="/connectors" element={<Navigate to="/" replace />} />
              <Route path="/configs/new" element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
        } />
      </Routes>
    </ErrorBoundary>
  );
}
