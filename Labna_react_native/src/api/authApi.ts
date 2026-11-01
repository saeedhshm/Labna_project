import { request } from '@src/core/api/apiClient';
import type { ApiResponse } from '@src/api/contracts/common';

import type {
  AuthResponse,
  LoginRequest,
  LogoutResponse,
  RegisterRequest,
} from '@src/api/contracts/auth';

export const authApi = {
  register(
    body: RegisterRequest,
    signal?: AbortSignal,
  ) {
    return request<ApiResponse<AuthResponse>>({
      method: 'POST',
      url: '/customer/auth/register',
      data: body,
      signal,
    });
  },

  login(
    body: LoginRequest,
    signal?: AbortSignal,
  ) {
    return request<ApiResponse<AuthResponse>>({
      method: 'POST',
      url: '/customer/auth/login',
      data: body,
      signal,
    });
  },

  logout(signal?: AbortSignal) {
    return request<ApiResponse<LogoutResponse>>({
      method: 'POST',
      url: '/customer/auth/logout',
      signal,
    });
  },

  getCurrentCustomer(signal?: AbortSignal) {
    return request<ApiResponse<AuthResponse['customer']>>({
      method: 'GET',
      url: '/customer/me',
      signal,
    });
  },
};