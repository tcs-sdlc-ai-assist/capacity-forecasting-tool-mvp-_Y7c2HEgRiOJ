/* eslint-disable react-refresh/only-export-components */
import {
  Navigate,
  createBrowserRouter,
} from 'react-router-dom';
import RouteAccessGuard from '../components/auth/RouteAccessGuard.jsx';
import AppLayout from '../components/layout/AppLayout.jsx';
import ForecastPage from '../pages/ForecastPage.jsx';
import LoginPage from '../pages/LoginPage.jsx';
import NotFoundPage from '../pages/NotFoundPage.jsx';
import RouteErrorPage from '../pages/RouteErrorPage.jsx';

export const router = createBrowserRouter([
  {
    path: '/',
    errorElement: <RouteErrorPage />,
    children: [
      {
        index: true,
        element: <Navigate replace to="/forecast" />,
      },
      {
        path: 'login',
        element: <LoginPage />,
      },
      {
        element: <RouteAccessGuard />,
        errorElement: <RouteErrorPage />,
        children: [
          {
            element: <AppLayout />,
            children: [
              {
                path: 'forecast',
                element: <ForecastPage />,
              },
            ],
          },
        ],
      },
      {
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
]);

export default router;