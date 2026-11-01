export type ApiResponse<T, Meta = unknown> = {
    data: T;
    meta? : Meta
}

export type ApiErrorResponse = {
    error: {
        code: string;
        message: string;
    };
}