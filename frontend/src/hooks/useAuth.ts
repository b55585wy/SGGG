const ACCOUNTS_KEY = 'storybook_accounts';
const USER_KEY = 'storybook_user';

interface Account {
  username: string;
  password: string;
}

function getAccounts(): Account[] {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '[]');
  } catch {
    return [];
  }
}

export function register(username: string, password: string): void {
  const accounts = getAccounts();
  if (accounts.some((a) => a.username === username)) {
    throw new Error('该用户名已被注册');
  }
  accounts.push({ username, password });
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  localStorage.setItem(USER_KEY, username);
}

export function login(username: string, password: string): void {
  const accounts = getAccounts();
  const match = accounts.find((a) => a.username === username && a.password === password);
  if (!match) {
    throw new Error('用户名或密码错误');
  }
  localStorage.setItem(USER_KEY, username);
}

export function logout(): void {
  localStorage.removeItem(USER_KEY);
}

export function isAuthenticated(): boolean {
  return !!localStorage.getItem(USER_KEY);
}

export function currentUser(): string | null {
  return localStorage.getItem(USER_KEY);
}
