import axios, {AxiosError, AxiosRequestConfig} from "axios";
import { API_BASE_URL, API_TIMEOUT_MS } from "@src/api/api";
import { ApiError } from "./ApiError";
import { getAccessToken } from "./accessToken";

export const apiClient = axios.create({
    baseURL:API_BASE_URL,
    timeout: API_TIMEOUT_MS,
    headers:{
        Accept:"application/json",
        'Content-Type':'application/json'
    }
})

// Interceptor will run before every request (Middleware before requests)
apiClient.interceptors.request.use((config)=>{

    const token = getAccessToken()

    if(token){
        config.headers.set('Authorization', `Bearer ${token}`);
    }else{
        config.headers.delete('Authorization')
    }

    return config
})

// Interceptor will run after every response (Middleware after responses)
apiClient.interceptors.response.use(
    (response)=> response,
    (error:AxiosError)=>{
        // Error handling
        const body = error.response?.data as  | {
          error?: {
            code?: string;
            message?: string;
          };
        }
      | undefined;

      const status = error.response?.status ?? 0;

      const code = body?.error?.code ?? (status === 0 ? 'NETWORK_ERROR' : 'UNKNOWN_ERROR');

         const message = body?.error?.message ?? (status === 0 ? 'Unable to connect to the server' : `Request failed with status ${status}`);

          return Promise.reject(
      new ApiError(status, code, message),
    );
    }
)


export async function request<T>(
  config: AxiosRequestConfig,
): Promise<T> {
  const response = await apiClient.request<T>(config);
  return response.data;
}