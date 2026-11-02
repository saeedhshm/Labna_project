import type {NavigatorScreenParams} from '@react-navigation/native'

export type QuickAddRouteParams = {
    productId: string;
}
export type ProductDetailsRouteParams = {
  productId: string;
};
export type CatalogRouteParams =
  | {
      initialCategoryId?: string;
    }
  | undefined;

export type AddressFormRouteParams = {
    mode : 'add'
}
|{
    mode : 'edit'
    addressId: string;
}

export type HomeStackParamList = {
  Home: undefined;

  CategoryCatalog: {
    categoryId: string;
  };

  ProductDetails: ProductDetailsRouteParams;

  RecentlyViewed: undefined;
};
export type CatalogStackParamList = {
  Catalog: CatalogRouteParams;

  ProductDetails: ProductDetailsRouteParams;
};

export type CartStackParamList = {
  Cart: undefined;

  CheckoutReview: undefined;

  OrderSuccess: {
    orderId: string;
  };
};

export type MoreStackParamList = {
  More: undefined;

  Account: undefined;

  EditProfile: undefined;

  ChangePassword: undefined;

  Addresses: undefined;

  AddressForm: AddressFormRouteParams;

  Orders: undefined;

  OrderDetail: {
    orderId: string;
  };

  Favorites: undefined;

  RecentlyViewed: undefined;

  About: undefined;

  Contact: undefined;

  Branches: undefined;

  BranchDetail: {
    branchId: string;
  };

  ProductDetails: ProductDetailsRouteParams;
};

export type MainTabParamList = {
  HomeTab:
    | NavigatorScreenParams<HomeStackParamList>
    | undefined;

  CatalogTab:
    | NavigatorScreenParams<CatalogStackParamList>
    | undefined;

  CartTab:
    | NavigatorScreenParams<CartStackParamList>
    | undefined;

  MoreTab:
    | NavigatorScreenParams<MoreStackParamList>
    | undefined;
};
export type RootStackParamList = {
  MainTabs:
    | NavigatorScreenParams<MainTabParamList>
    | undefined;

  QuickAdd: QuickAddRouteParams;
};