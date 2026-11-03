import React from 'react';

import {
  Ionicons,
} from '@react-native-vector-icons/ionicons/static';

import {
  NavigationContainer,

} from '@react-navigation/native';

import {
  createBottomTabNavigator,
} from '@react-navigation/bottom-tabs';

import {
  createNativeStackNavigator,
} from '@react-navigation/native-stack';

import {
  StyleSheet,
  View,
  Text,
} from 'react-native';


import {
  useTranslation,
} from 'react-i18next';

import {
  colors,
  spacing,
  typography,
} from '@src/theme';

import {
  isRTL,
  type AppLanguage,
} from '@src/i18n';

import {
  labnaNavigationTheme,
} from './navigationTheme';

import type {
  CartStackParamList,
  CatalogStackParamList,
  HomeStackParamList,
  MainTabParamList,
  MoreStackParamList,
  RootStackParamList,
} from './navigationTypes';

import {
  HomeScreen,
} from '@src/features/home/screens';

const RootStack =
  createNativeStackNavigator<RootStackParamList>();

const MainTab =
  createBottomTabNavigator<MainTabParamList>();

const HomeStack =
  createNativeStackNavigator<HomeStackParamList>();

const CatalogStack =
  createNativeStackNavigator<CatalogStackParamList>();

const CartStack =
  createNativeStackNavigator<CartStackParamList>();

const MoreStack =
  createNativeStackNavigator<MoreStackParamList>();

type TabBarIconProps = {
  color: string;
  size: number;
  focused: boolean;
};

type IoniconName = React.ComponentProps<
  typeof Ionicons
>['name'];

/**
 * Builds a tab bar icon renderer outside of the navigator
 * so React does not see a new component type on every render.
 */
function createTabBarIcon(
  activeName: IoniconName,
  inactiveName: IoniconName,
) {
  return function TabBarIcon({
    color,
    size,
    focused,
  }: TabBarIconProps) {
    return (
      <Ionicons
        name={
          focused ? activeName : inactiveName
        }
        color={color}
        size={size}
      />
    );
  };
}

const renderHomeTabIcon = createTabBarIcon(
  'home',
  'home-outline',
);

const renderCatalogTabIcon = createTabBarIcon(
  'grid',
  'grid-outline',
);

const renderCartTabIcon = createTabBarIcon(
  'bag',
  'bag-outline',
);

const renderMoreTabIcon = createTabBarIcon(
  'ellipsis-horizontal',
  'ellipsis-horizontal',
);

/**
 * Temporary development-only content.
 *
 * Replace this component one screen at a time as we implement
 * Home, Catalog, Cart, and More.
 */
function NavigationFoundationScreen() {
  const { t } = useTranslation();

  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderText}>
        {t(
          'navigation.foundationReady',
        )}
      </Text>
    </View>
  );
}

function HomeNavigator() {
  return (
    <HomeStack.Navigator
      screenOptions={
        stackScreenOptions
      }
    >
      <HomeStack.Screen
        name="Home"
        component={HomeScreen}
        options={{
          headerShown: false,
        }}
      />

      <HomeStack.Screen
        name="CategoryCatalog"
        component={
          NavigationFoundationScreen
        }
        options={{
          title: '',
        }}
      />

      <HomeStack.Screen
        name="ProductDetails"
        component={
          NavigationFoundationScreen
        }
        options={{
          title: '',
        }}
      />

      <HomeStack.Screen
        name="RecentlyViewed"
        component={
          NavigationFoundationScreen
        }
        options={{
          title: '',
        }}
      />
    </HomeStack.Navigator>
  );
}

function CatalogNavigator() {
  const { t } = useTranslation();

  return (
    <CatalogStack.Navigator
      screenOptions={stackScreenOptions}
    >
      <CatalogStack.Screen
        name="Catalog"
        component={NavigationFoundationScreen}
        options={{
          title: t('tab.products'),
          headerLargeTitle: true,
        }}
      />
    </CatalogStack.Navigator>
  );
}

function CartNavigator() {
  const { t } = useTranslation();

  return (
    <CartStack.Navigator
      screenOptions={stackScreenOptions}
    >
      <CartStack.Screen
        name="Cart"
        component={NavigationFoundationScreen}
        options={{
          title: t('tab.cart'),
          headerLargeTitle: true,
        }}
      />
    </CartStack.Navigator>
  );
}

function MoreNavigator() {
  const { t } = useTranslation();

  return (
    <MoreStack.Navigator
      screenOptions={stackScreenOptions}
    >
      <MoreStack.Screen
        name="More"
        component={NavigationFoundationScreen}
        options={{
          title: t('tab.more'),
          headerLargeTitle: true,
        }}
      />
    </MoreStack.Navigator>
  );
}

function MainTabNavigator() {
  const { t } = useTranslation();

  return (
    <MainTab.Navigator
      screenOptions={{
        headerShown: false,

        tabBarActiveTintColor:
          colors.labnaGreen,

        tabBarInactiveTintColor:
          colors.labnaMuted,

        tabBarHideOnKeyboard: true,

        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopColor: colors.labnaBorder,
        },

        tabBarLabelStyle: {
          ...typography.caption,
        },
      }}
    >
      <MainTab.Screen
        name="HomeTab"
        component={HomeNavigator}
        options={{
          title: t('tab.home'),
          tabBarIcon: renderHomeTabIcon,
        }}
      />

      <MainTab.Screen
        name="CatalogTab"
        component={CatalogNavigator}
        options={{
          title: t('tab.products'),
          tabBarIcon: renderCatalogTabIcon,
        }}
      />

      <MainTab.Screen
        name="CartTab"
        component={CartNavigator}
        options={{
          title: t('tab.cart'),
          tabBarIcon: renderCartTabIcon,

          /**
           * We will connect this to the real cart quantity
           * when CartStore is implemented.
           */
          tabBarBadge: undefined,
        }}
      />

      <MainTab.Screen
        name="MoreTab"
        component={MoreNavigator}
        options={{
          title: t('tab.more'),
          tabBarIcon: renderMoreTabIcon,
        }}
      />
    </MainTab.Navigator>
  );
}

export function RootNavigator() {
  const { i18n } = useTranslation();

  const language: AppLanguage =
    i18n.resolvedLanguage === 'ar'
      ? 'ar'
      : 'en';

  const direction = isRTL(language)
    ? 'rtl'
    : 'ltr';

  return (
    <NavigationContainer
      key={language}
      direction={direction}
      theme={labnaNavigationTheme}
    >
      <RootStack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: colors.white,
          },
        }}
      >
        <RootStack.Screen
          name="MainTabs"
          component={MainTabNavigator}
        />
        <RootStack.Screen
          name="QuickAdd"
          component={
            NavigationFoundationScreen
          }
          options={{
            headerShown: true,
            presentation: 'modal',
            title: '',
          }}
        />
      </RootStack.Navigator>
    </NavigationContainer>
  );
}

const stackScreenOptions = {
  headerTintColor: colors.labnaGreen,

  headerTitleStyle: {
    ...typography.headline,
    color: colors.labnaInk,
  },

  headerLargeTitleStyle: {
    ...typography.largeTitle,
    color: colors.labnaInk,
  },

  headerStyle: {
    backgroundColor: colors.white,
  },

  headerShadowVisible: false,
} as const;

const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
    gap: spacing.medium,
    justifyContent: 'center',
    padding: spacing.large,
    backgroundColor: colors.cream25,
  },
  placeholderText: {
    ...typography.body,
    color: colors.labnaMuted,
    textAlign: 'center',
  },

  topInset: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.labnaGreen,
  },
});