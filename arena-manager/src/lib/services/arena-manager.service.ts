/**
 * Low-level HTTP helper for the arena-manager api.
 *
 * The arena-manager API lives under /arena-manager/api and expects a
 * `sessionId` request header.
 * In the TC platform context that value is sourced from the v3 JWT so that existing TC sessions are reused.
 *
 * All methods return a typed Promise or throw on HTTP/network errors.
 */
import { tokenGetAsync, TokenModel } from '~/libs/core'

import { ResponseObject } from '../models'

export const ARENA_API_BASE = '/arena-manager/api'

async function getSessionId(): Promise<string> {
    try {
        const token: TokenModel | undefined = await tokenGetAsync()
        return token?.token ?? 'testSession'
    } catch {
        return 'testSession'
    }
}

function buildHeaders(extra?: Record<string, string>): Promise<HeadersInit> {
    return getSessionId().then(sessionId => ({
        sessionId,
        ...extra,
    }))
}

/**
 * JSON-body API call (GET / POST / PUT with JSON).
 */
export async function arenaApiRequest<T>(
    method: string,
    path: string,
    body?: unknown,
): Promise<ResponseObject<T>> {
    const extraHeaders: Record<string, string> = {}
    if (body !== undefined) {
        extraHeaders['Content-Type'] = 'application/json'
    }
    const headers = await buildHeaders(extraHeaders)
    const init: RequestInit = { method, headers }
    if (body !== undefined) {
        init.body = JSON.stringify(body)
    }

    const response = await fetch(`${ARENA_API_BASE}${path}`, init)
    const data: ResponseObject<T> = await response.json()

    if (!response.ok) {
        throw new Error(data.message ?? `HTTP ${response.status}`)
    }
    return data
}

/**
 * Binary (octet-stream) upload for problem ZIP files.
 */
export async function arenaApiUploadBinary<T>(
    path: string,
    file: File,
    problemName?: string,
): Promise<ResponseObject<T>> {
    const sessionId = await getSessionId()
    const headers: Record<string, string> = {
        sessionId,
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${file.name}"`,
    }
    if (problemName) {
        headers['X-Problem-Name'] = problemName
    }
    const response = await fetch(`${ARENA_API_BASE}${path}`, {
        method: 'POST',
        headers,
        body: file,
    })

    const data: ResponseObject<T> = await response.json()

    if (!response.ok) {
        throw new Error(data.message ?? `HTTP ${response.status}`)
    }
    return data
}
