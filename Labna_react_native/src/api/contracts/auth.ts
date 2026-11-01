export type CustomerAddress = {
  id: string;
  label: string;
  recipientName?: string;
  phoneNumber?: string;
  city: string;
  district: string;
  street: string;
  building: string;
  apartment?: string;
  notes?: string;
  isDefault: boolean;
};

export type Customer = {
  id: string;
  name: string;
  phoneNumber: string;
  email: string;
  addresses: CustomerAddress[];
  createdAt: string;
};



export type CustomerLoginBody = {
  email: string;
  password: string;
};

export type CustomerAuthResponse = {
  accessToken: string;
  expiresIn: number;
  customer: Customer;
};






export type RegisterRequest = {
  name: string;
  phoneNumber: string;
  email?: string;
  password: string;
};

export type LoginRequest = {
  email: string;
  password: string;
};

export type AuthResponse = {
  accessToken: string;
  expiresIn: number;
  customer: Customer;
};

export type LogoutResponse = {
  loggedOut: boolean;
};