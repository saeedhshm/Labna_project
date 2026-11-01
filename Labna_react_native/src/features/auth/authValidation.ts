import { RegisterRequest } from "@src/api/contracts/auth";

export type RegisterForm = RegisterRequest & {
  confirmPassword: string;
}

export type RegisterValidationError =
  | 'nameTooShort'
  | 'invalidPhone'
  | 'invalidEmail'
  | 'passwordTooShort'
  | 'passwordMismatch';


  export function validateRegister(
  form: RegisterForm,
): RegisterValidationError | null {
  if (form.name.trim().length < 2) {
    return 'nameTooShort';
  }

  if (!/^\+[1-9]\d{7,14}$/.test(form.phoneNumber)) {
    return 'invalidPhone';
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    return 'invalidEmail';
  }

  if (form.password.length < 8) {
    return 'passwordTooShort';
  }

  if (form.password !== form.confirmPassword) {
    return 'passwordMismatch';
  }

  return null;
}