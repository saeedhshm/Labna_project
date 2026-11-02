import React from 'react';

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
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  PrimaryButton,
  SecondaryButton,
} from '@src/components/buttons';
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

/**
 * Temporary development-only content.
 *
 * Replace this component one screen at a time as we implement
 * Home, Catalog, Cart, and More.
 */
function NavigationFoundationScreen() {
    const insets = useSafeAreaInsets();
  return (
    <View style={ {
  flex: 1,
  justifyContent: 'center',
  gap: spacing.medium,
  padding: spacing.large,
  backgroundColor: colors.cream25,
}}>
        <View
        style={{
          height: insets.top,
          backgroundColor: colors.labnaGreen,
        }}
      />
      <PrimaryButton
        title="Primary button"
        
        onPress={() => {
          console.log('Primary pressed');
        }}
      />

      <SecondaryButton
        title="Secondary button"
        onPress={() => {
          console.log('Secondary pressed');
        }}
      />

      <PrimaryButton
        title="Disabled button"
        disabled
        onPress={() => {
          console.log('Disabled');
        }}
      />

      <SecondaryButton
        title="Loading button"
        isLoading
        onPress={() => {
          console.log('Loading');
        }}
      />
    </View>
  );
}

function HomeNavigator() {
  return (
    <HomeStack.Navigator>
      <HomeStack.Screen
        name="Home"
        component={NavigationFoundationScreen}
        options={{
          headerShown: false,
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
        }}
      />

      <MainTab.Screen
        name="CatalogTab"
        component={CatalogNavigator}
        options={{
          title: t('tab.products'),
        }}
      />

      <MainTab.Screen
        name="CartTab"
        component={CartNavigator}
        options={{
          title: t('tab.cart'),

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
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cream25,
    padding: spacing.large,
  },

  placeholderText: {
    ...typography.body,
    color: colors.labnaMuted,
    textAlign: 'center',
  },
});