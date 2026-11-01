export type Favorite = {
  productID: string;
  createdAt: string;
};

export type FavoritesResponse = {
  favorites: Favorite[];
};

export type AddFavoriteRequest = {
  productID: string;
};

export type RemoveFavoriteResponse = {
  deleted: boolean;
  productID: string;
};