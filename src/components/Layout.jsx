import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Layout({ children }) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0">
        <div className="px-5 py-4 border-b border-gray-200">
          <span className="font-semibold text-gray-900 text-sm">Summit Email</span>
        </div>
        <nav className="flex-1 py-4 px-3 flex flex-col gap-1">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `px-3 py-2 rounded-md text-sm font-medium ${isActive ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`
            }
          >
            Dashboard
          </NavLink>
          <NavLink
            to="/contacts"
            className={({ isActive }) =>
              `px-3 py-2 rounded-md text-sm font-medium ${isActive ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`
            }
          >
            Contacts
          </NavLink>
          <NavLink
            to="/campaigns"
            className={({ isActive }) =>
              `px-3 py-2 rounded-md text-sm font-medium ${isActive ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`
            }
          >
            Campaigns
          </NavLink>
          <NavLink
            to="/csv-send"
            className={({ isActive }) =>
              `px-3 py-2 rounded-md text-sm font-medium ${isActive ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`
            }
          >
            CSV Send
          </NavLink>
        </nav>
        <div className="px-3 pb-4">
          <button
            onClick={handleLogout}
            className="w-full px-3 py-2 rounded-md text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-900 text-left"
          >
            Log out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-8">
        {children}
      </main>
    </div>
  );
}
