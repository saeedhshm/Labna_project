import React, {
    useMemo,
    useState,
  } from 'react';
  
  import {
    Linking,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
  } from 'react-native';
  
  import type {
    NativeStackScreenProps,
  } from '@react-navigation/native-stack';
  
  import type {
    NativeStackNavigationProp,
  } from '@react-navigation/native-stack';
  
  import {
    SafeAreaView,
  } from 'react-native-safe-area-context';
  
  import {
    useTranslation,
  } from 'react-i18next';
  
  import type {
    Banner,
    Product,
  } from '@src/api/contracts/catalog';
  
  import {
    BannerCarousel,
    CategoryCard,
    ProductGrid,
  } from '@src/components/catalog';
  
  import {
    EmptyState,
    ErrorState,
    LoadingState,
    OfflineNotice,
  } from '@src/components/states/ScreenStates';
  
  import {
    useCatalog,
  } from '@src/features/catalog/CatalogContext';
  
  import {
    searchProducts,
    sortProductsByFeatured,
  } from '@src/features/catalog/catalogFormatting';
  
  import type {
    AppLanguage,
  } from '@src/i18n';
  
  import type {
    HomeStackParamList,
    RootStackParamList,
  } from '@src/navigation/navigationTypes';
  
  import {
    colors,
    sizes,
    spacing,
    typography,
  } from '@src/theme';
  
  import {
    HomeHeader,
  } from '../components';
  
  type HomeScreenProps =
    NativeStackScreenProps<
      HomeStackParamList,
      'Home'
    >;
  
  type RootNavigation =
    NativeStackNavigationProp<
      RootStackParamList
    >;
  
  export function HomeScreen({
    navigation,
  }: HomeScreenProps) {
    const { t, i18n } = useTranslation();
  
    const {
      snapshot,
      isInitialLoading,
      isRefreshing,
      error,
      refreshError,
      refreshErrorIsOffline,
      reload,
    } = useCatalog();
  
    const [searchText, setSearchText] =
      useState('');
  
    const [
      searchExpanded,
      setSearchExpanded,
    ] = useState(false);
  
    const language: AppLanguage =
      i18n.resolvedLanguage === 'ar'
        ? 'ar'
        : 'en';
  
    const isArabic =
      language === 'ar';
  
    const trimmedSearchText =
      searchText.trim();
  
    const searchResults = useMemo(
      () =>
        snapshot
          ? sortProductsByFeatured(
              searchProducts(
                snapshot.products,
                searchText,
                language,
              ),
              language,
            )
          : [],
      [
        language,
        searchText,
        snapshot,
      ],
    );
  
    const featuredProducts = useMemo(
      () =>
        snapshot
          ? sortProductsByFeatured(
              snapshot.products.filter(
                product =>
                  product.isFeatured,
              ),
              language,
            )
          : [],
      [
        language,
        snapshot,
      ],
    );
  
    if (
      isInitialLoading &&
      !snapshot
    ) {
      return (
        <SafeAreaView
          edges={[
            'top',
            'left',
            'right',
          ]}
          style={styles.screen}
        >
          <LoadingState
            title={t('data.loading')}
          />
        </SafeAreaView>
      );
    }
  
    if (!snapshot && error) {
      return (
        <SafeAreaView
          edges={[
            'top',
            'left',
            'right',
          ]}
          style={styles.screen}
        >
          <ErrorState
            title={t(
              'data.error.title',
            )}
            message={t(
              'data.error.general',
            )}
            retryTitle={t(
              'data.retry',
            )}
            onRetry={reload}
          />
        </SafeAreaView>
      );
    }
  
    if (!snapshot) {
      return (
        <SafeAreaView
          edges={[
            'top',
            'left',
            'right',
          ]}
          style={styles.screen}
        >
          <LoadingState
            title={t('data.loading')}
          />
        </SafeAreaView>
      );
    }
    const catalogSnapshot = snapshot;
    function openProduct(
      product: Product,
    ) {
      navigation.navigate(
        'ProductDetails',
        {
          productId: product.id,
        },
      );
    }
  
    function openCategory(
      categoryID: string,
    ) {
      navigation.navigate(
        'CategoryCatalog',
        {
          categoryId: categoryID,
        },
      );
    }
  
    function openQuickAdd(
      product: Product,
    ) {
      const tabNavigation =
        navigation.getParent();
  
      const rootNavigation =
        tabNavigation
          ?.getParent<RootNavigation>();
  
      rootNavigation?.navigate(
        'QuickAdd',
        {
          productId: product.id,
        },
      );
    }
  
    async function openBanner(
      banner: Banner,
    ) {
      const destination =
        banner.destination;

      switch (destination.kind) {
        case 'product': {
          const productID =
            destination.id;

          const product =
            catalogSnapshot.products.find(
              item =>
                item.id === productID,
            );
  
          if (product) {
            openProduct(product);
          }
  
          break;
        }
  
        case 'category':
          openCategory(
            destination.id,
          );
          break;

        case 'external': {
          const externalURL =
            destination.url;

          const canOpen =
            await Linking.canOpenURL(
              externalURL,
            );

          if (canOpen) {
            await Linking.openURL(
              externalURL,
            );
          }
  
          break;
        }
  
        case 'none':
          break;
      }
    }
  
    return (
      <SafeAreaView
        edges={[
          'top',
          'left',
          'right',
        ]}
        style={styles.screen}
      >
        {refreshError &&
        refreshErrorIsOffline ? (
          <OfflineNotice
            message={t(
              'catalog.offlineSavedData',
            )}
          />
        ) : null}
  
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={
            false
          }
          refreshControl={
            <RefreshControl
              refreshing={
                isRefreshing
              }
              tintColor={
                colors.labnaGreen
              }
              colors={[
                colors.labnaGreen,
              ]}
              onRefresh={reload}
            />
          }
          contentContainerStyle={
            styles.scrollContent
          }
        >
          <HomeHeader
            searchText={searchText}
            onSearchTextChange={
              setSearchText
            }
            searchExpanded={
              searchExpanded
            }
            onExpandSearch={() => {
              setSearchExpanded(true);
            }}
            onCollapseSearch={() => {
              setSearchExpanded(false);
            }}
          />
  
          {trimmedSearchText ? (
            <SearchContent
              products={
                searchResults
              }
              isArabic={isArabic}
              emptyTitle={t(
                'search.empty.title',
              )}
              emptyMessage={t(
                'search.empty.message',
              )}
              clearTitle={t(
                'search.clear',
              )}
              resultsTitle={t(
                'search.results',
              )}
              onClear={() => {
                setSearchText('');
              }}
              onOpen={openProduct}
              onQuickAdd={
                openQuickAdd
              }
            />
          ) : (
            <>
              <BannerCarousel
                banners={
                  snapshot.banners
                }
                onBannerPress={
                  openBanner
                }
              />
  
              {snapshot.categories
                .length > 0 ? (
                <View
                  style={
                    styles.section
                  }
                >
                  <SectionTitle
                    title={t(
                      'home.categories',
                    )}
                    isArabic={
                      isArabic
                    }
                  />
  
                  <ScrollView
                    horizontal
                    nestedScrollEnabled
                    showsHorizontalScrollIndicator={
                      false
                    }
                    contentContainerStyle={[
                      styles.categoryList,
  
                      isArabic
                        ? styles.rowRTL
                        : styles.rowLTR,
                    ]}
                  >
                    {snapshot.categories.map(
                      category => (
                        <View
                          key={
                            category.id
                          }
                          style={
                            styles.categoryCard
                          }
                        >
                          <CategoryCard
                            category={
                              category
                            }
                            onPress={() => {
                              openCategory(
                                category.id,
                              );
                            }}
                          />
                        </View>
                      ),
                    )}
                  </ScrollView>
                </View>
              ) : null}
  
              <View style={styles.section}>
                <SectionTitle
                  title={t(
                    'home.featured',
                  )}
                  isArabic={
                    isArabic
                  }
                />
  
                <ProductGrid
                  products={
                    featuredProducts
                  }
                  onOpen={openProduct}
                  onQuickAdd={
                    openQuickAdd
                  }
                />
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }
  
  type SearchContentProps = {
    products: Product[];
    isArabic: boolean;
  
    emptyTitle: string;
    emptyMessage: string;
    clearTitle: string;
    resultsTitle: string;
  
    onClear: () => void;
  
    onOpen: (
      product: Product,
    ) => void;
  
    onQuickAdd: (
      product: Product,
    ) => void;
  };
  
  function SearchContent({
    products,
    isArabic,
    emptyTitle,
    emptyMessage,
    clearTitle,
    resultsTitle,
    onClear,
    onOpen,
    onQuickAdd,
  }: SearchContentProps) {
    if (!products.length) {
      return (
        <View style={styles.emptySearch}>
          <EmptyState
            title={emptyTitle}
            message={emptyMessage}
            icon="search-outline"
            actionTitle={clearTitle}
            onAction={onClear}
          />
        </View>
      );
    }
  
    return (
      <View style={styles.section}>
        <SectionTitle
          title={resultsTitle}
          isArabic={isArabic}
        />
  
        <ProductGrid
          products={products}
          onOpen={onOpen}
          onQuickAdd={onQuickAdd}
        />
      </View>
    );
  }
  
  type SectionTitleProps = {
    title: string;
    isArabic: boolean;
  };
  
  function SectionTitle({
    title,
    isArabic,
  }: SectionTitleProps) {
    return (
      <Text
        style={[
          styles.sectionTitle,
  
          isArabic
            ? styles.textRTL
            : styles.textLTR,
        ]}
      >
        {title}
      </Text>
    );
  }
  
  const styles = StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.cream25,
    },
  
    scrollContent: {
      paddingTop: spacing.medium,
      paddingBottom:
        spacing.extraLarge,
      gap: spacing.extraLarge,
    },
  
    section: {
      gap: spacing.medium,
      paddingHorizontal:
        spacing.large,
    },
  
    sectionTitle: {
      ...typography.brand,
      color: colors.labnaInk,
    },
  
    categoryList: {
      gap: spacing.medium,
    },
  
    categoryCard: {
      width:
        sizes.categoryCardWidth,
    },
  
    rowLTR: {
      flexDirection: 'row',
    },
  
    rowRTL: {
      flexDirection: 'row-reverse',
    },
  
    emptySearch: {
      minHeight: 330,
      marginHorizontal:
        spacing.large,
  
      overflow: 'hidden',
      borderRadius: 24,
    },
  
    textLTR: {
      textAlign: 'left',
      writingDirection: 'ltr',
    },
  
    textRTL: {
      textAlign: 'right',
      writingDirection: 'rtl',
    },
  });
