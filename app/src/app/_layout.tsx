import { Geist_300Light, Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold } from '@expo-google-fonts/geist';
import { GeistMono_400Regular } from '@expo-google-fonts/geist-mono';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { PinProvider } from '@/components/Pin';
import { c } from '@/theme';

export default function RootLayout() {
  const [loaded] = useFonts({ Geist_300Light, Geist_400Regular, Geist_500Medium, Geist_600SemiBold, Geist_700Bold, GeistMono_400Regular });

  if (!loaded) {
    return (
      <View style={{ flex: 1, backgroundColor: c.band, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={c.ink} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <PinProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg }, animation: 'slide_from_right' }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="savings-info" options={{ presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }} />
          <Stack.Screen name="add-funds" options={{ presentation: 'transparentModal', animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }} />
        </Stack>
      </PinProvider>
    </SafeAreaProvider>
  );
}
