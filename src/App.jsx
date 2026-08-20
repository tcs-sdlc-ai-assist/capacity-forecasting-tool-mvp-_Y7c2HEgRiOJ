import { RouterProvider } from 'react-router-dom';
import router from './app/router.jsx';
import AppProviders from './providers/AppProviders.jsx';

/**
 * Composes global application providers and the application router.
 *
 * @returns {import('react').ReactNode} Application root.
 */
export const App = () => (
  <AppProviders>
    <RouterProvider router={router} />
  </AppProviders>
);

export default App;