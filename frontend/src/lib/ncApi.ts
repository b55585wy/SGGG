import { getToken } from './auth'

export type ApiError = {
  status: number
  message: string
}

function rewritePath(path: string): string {
  if (path.startsWith('/api/')) {
    return '/api/user/' + path.slice(5)
  }
  return path
}

async function parseJsonSafely(res: Response) {
  const text = await res.text()
  try {
    return text ? (JSON.parse(text) as unknown) : null
  } catch {
    return null
  }
}

export async function postJson<TResponse>(
  path: string,
  body: unknown,
  init?: RequestInit,
): Promise<TResponse> {
  const token = getToken()
  const res = await fetch(rewritePath(path), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
    body: JSON.stringify(body),
    ...init,
  })

  const data = await parseJsonSafely(res)
  if (!res.ok) {
    let message = '请求失败'
    if (
      data &&
      typeof data === 'object' &&
      'message' in data &&
      typeof (data as { message?: unknown }).message === 'string'
    ) {
      message = (data as { message: string }).message
    }
    throw { status: res.status, message } as ApiError
  }
  return data as TResponse
}

export async function getJson<TResponse>(
  path: string,
  init?: RequestInit,
): Promise<TResponse> {
  const token = getToken()
  const res = await fetch(rewritePath(path), {
    method: 'GET',
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
    ...init,
  })

  const data = await parseJsonSafely(res)
  if (!res.ok) {
    let message = '请求失败'
    if (
      data &&
      typeof data === 'object' &&
      'message' in data &&
      typeof (data as { message?: unknown }).message === 'string'
    ) {
      message = (data as { message: string }).message
    }
    throw { status: res.status, message } as ApiError
  }
  return data as TResponse
}
