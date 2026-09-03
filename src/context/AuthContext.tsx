import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from 'firebase/auth';
import { onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { auth } from '../firebase/config';

interface AuthContextType {
  user: User | null;
  role: string | null;
  loading: boolean;
  setRole: (role: string) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  loading: true,
  setRole: () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRoleState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load role from local storage if available
  useEffect(() => {
    const savedRole = localStorage.getItem('drone_shield_role');
    if (savedRole) {
      setRoleState(savedRole);
    }
  }, []);

  const setRole = (newRole: string) => {
    setRoleState(newRole);
    localStorage.setItem('drone_shield_role', newRole);
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
    setRoleState(null);
    localStorage.removeItem('drone_shield_role');
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser: User | null) => {
      setUser(currentUser);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  return (
    <AuthContext.Provider value={{ user, role, loading, setRole, signOut }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
