import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ThemeProvider } from './lib/theme';
import TabNavigator from './screens/TabNavigator';
import Player from './screens/Player';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <ThemeProvider>
      <NavigationContainer>
        <StatusBar style="light" />
        <Stack.Navigator
          initialRouteName="Main"
          screenOptions={{ headerShown: false }}
        >
          <Stack.Screen name="Main" component={TabNavigator} />
          <Stack.Screen name="Player" component={Player} />
        </Stack.Navigator>
      </NavigationContainer>
    </ThemeProvider>
  );
}
