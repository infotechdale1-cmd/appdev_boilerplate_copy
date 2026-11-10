import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import {
  createUser,
  getUserByEmail,
  getUserByLoginIdentifier,
  getUserByUsername,
  getUserById,
  seedDemoDataIfEmpty,
  updateUserProfile,
  type User,
} from '@/db/studytrack';

const SESSION_KEY = 'studytrack_active_user_id';

interface AuthContextType {
  currentUser: User | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (data: {
    email: string;
    username: string;
    name: string;
    password: string;
    major?: string;
    institution?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  guestLogin: () => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (data: Partial<Pick<User, 'name' | 'major' | 'institution' | 'avatar_color'>>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Web fallback helper for secure storage
async function getStoredSession(): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return localStorage.getItem(SESSION_KEY);
    } catch {
      return null;
    }
  }
  try {
    return await SecureStore.getItemAsync(SESSION_KEY);
  } catch {
    return null;
  }
}

async function setStoredSession(userId: string | null): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (userId) {
        localStorage.setItem(SESSION_KEY, userId);
      } else {
        localStorage.removeItem(SESSION_KEY);
      }
    } catch {
      // Ignore web storage errors
    }
    return;
  }
  try {
    if (userId) {
      await SecureStore.setItemAsync(SESSION_KEY, userId);
    } else {
      await SecureStore.deleteItemAsync(SESSION_KEY);
    }
  } catch {
    // Ignore secure store errors
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session on app launch
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const savedId = await getStoredSession();
        if (savedId) {
          const user = await getUserById(savedId);
          if (user && mounted) {
            await seedDemoDataIfEmpty(user.id);
            setCurrentUser(user);
          }
        }
      } catch (err) {
        console.warn('Failed to restore session:', err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const login = async (username: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const user = await getUserByLoginIdentifier(username);
      if (!user) {
        return { success: false, error: 'No account found with this username or email address.' };
      }
      if (user.password_hash !== password) {
        return { success: false, error: 'Incorrect password. Please try again.' };
      }

      await seedDemoDataIfEmpty(user.id);
      await setStoredSession(user.id);
      setCurrentUser(user);
      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login failed.';
      return { success: false, error: message };
    }
  };

  const register = async (data: {
    email: string;
    username: string;
    name: string;
    password: string;
    major?: string;
    institution?: string;
  }): Promise<{ success: boolean; error?: string }> => {
    try {
      const existing = await getUserByEmail(data.email);
      if (existing) {
        return { success: false, error: 'An account with this email already exists.' };
      }
      const existingUsername = await getUserByUsername(data.username);
      if (existingUsername) {
        return { success: false, error: 'An account with this username already exists.' };
      }

      const user = await createUser({
        email: data.email,
        username: data.username,
        name: data.name,
        password: data.password,
        major: data.major || 'Computer Science',
        institution: data.institution || 'State University',
        avatar_color: '#4F46E5',
      });

      await seedDemoDataIfEmpty(user.id);
      await setStoredSession(user.id);
      setCurrentUser(user);
      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Registration failed.';
      return { success: false, error: message };
    }
  };

  const guestLogin = async (): Promise<void> => {
    try {
      // Find or create default student guest account
      const guestEmail = 'student@studytrack.app';
      let user = await getUserByEmail(guestEmail);
      if (!user) {
        user = await createUser({
          email: guestEmail,
          username: 'student_guest',
          name: 'Alex Rivera',
          password: 'studytrackdemo',
          major: 'Software Engineering',
          institution: 'Tech University',
          avatar_color: '#4F46E5',
        });
      }
      await seedDemoDataIfEmpty(user.id);
      await setStoredSession(user.id);
      setCurrentUser(user);
    } catch (err) {
      console.error('Guest login failed:', err);
    }
  };

  const logout = async (): Promise<void> => {
    await setStoredSession(null);
    setCurrentUser(null);
  };

  const updateUser = async (
    data: Partial<Pick<User, 'name' | 'major' | 'institution' | 'avatar_color'>>
  ): Promise<void> => {
    if (!currentUser) return;
    await updateUserProfile(currentUser.id, data);
    setCurrentUser((prev) => (prev ? { ...prev, ...data } : null));
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isLoading,
        login,
        register,
        guestLogin,
        logout,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
