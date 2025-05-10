import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { Alert, Platform, Vibration } from 'react-native';
import { recordMedicineDose } from './src/utils/historyService';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Import screens
import MedicinesListScreen from './src/screens/MedicinesListScreen';
import MedicineDetailsScreen from './src/screens/MedicineDetailsScreen';
import AddEditMedicineScreen from './src/screens/AddEditMedicineScreen';
import RemindersScreen from './src/screens/RemindersScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import SettingsScreen from './src/screens/SettingsScreen';

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const Tab = createBottomTabNavigator();
const MedicinesStack = createStackNavigator();

// config wibracji
const VIBRATION_PATTERN = Platform.OS === 'ios' 
  ? [1000, 2000, 1000] // iOS: wibracja, pauza, wibracja
  : [0, 1000, 500, 1000, 500, 1000]; // Android: opóźnienie, wibracja, pauza, wibracja

// Zarządzanie ciągłą wibracją
let vibrationIntervalId: NodeJS.Timeout | null = null;

// I cyk robimy wibracje
const startContinuousVibration = () => {
  // Zatrzymaj istniejącą wibrację jeśli istnieje
  stopContinuousVibration();
  
  // Różne podejście dla iOS i Android bo coś się spie...rniczyło
  if (Platform.OS === 'ios') {
    // iOS podobno nie ma ciłagej wibracji, więc interwał wlatuje
    vibrationIntervalId = setInterval(() => {
      Vibration.vibrate(VIBRATION_PATTERN);
    }, 4000); // Repeat co 4 sek
    
    // Uruchomienie wibracji od razu
    Vibration.vibrate(VIBRATION_PATTERN);
  } else {
    // Android obsługuje wibrację z nieskończonym powtórzeniem (true)
    Vibration.vibrate(VIBRATION_PATTERN, true);
  }
};

// Funkcja na cancel wibracji
const stopContinuousVibration = () => {
  if (vibrationIntervalId) {
    clearInterval(vibrationIntervalId);
    vibrationIntervalId = null;
  }
  Vibration.cancel(); 
};

function MedicinesStackScreen() {
  return (
    <MedicinesStack.Navigator>
      <MedicinesStack.Screen name="Medicines" component={MedicinesListScreen} options={{ title: 'Lista leków' }} />
      <MedicinesStack.Screen name="MedicineDetails" component={MedicineDetailsScreen} options={{ title: 'Szczegóły leku' }} />
      <MedicinesStack.Screen 
        name="AddEditMedicine" 
        component={AddEditMedicineScreen} 
        options={({ route }) => ({ 
          title: route.params?.medicine ? 'Edytuj lek' : 'Dodaj nowy lek' 
        })} 
      />
    </MedicinesStack.Navigator>
  );
}

export default function App() {
  const [notification, setNotification] = useState(false);
  const notificationListener = useRef();
  const responseListener = useRef();
  
  useEffect(() => {
    // Request notification permissions on app start
    registerForPushNotificationsAsync();
    
    // This listener is triggered when a notification is received while the app is in the foreground
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      setNotification(notification);
      
      // Show a dialog when notification is received in foreground
      const medicineId = notification.request.content.data?.medicineId;
      const medicineName = notification.request.content.data?.medicineName;
      const medicineDosage = notification.request.content.data?.medicineDosage;
      
      if (medicineId) {
        // Rozpocznij ciągłą wibrację przy otrzymaniu powiadomienia w pierwszym planie
        startContinuousVibration();
        showMedicineTakenDialog(medicineId, medicineName || 'Lek', medicineDosage || '');
      }
    });

    // This listener is triggered when a user taps on a notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const medicineId = response.notification.request.content.data?.medicineId;
      const medicineName = response.notification.request.content.data?.medicineName;
      const medicineDosage = response.notification.request.content.data?.medicineDosage;
      
      if (medicineId) {
        // Rozpocznij ciągłą wibrację gdy użytkownik tapnie na powiadomienie
        startContinuousVibration();
        showMedicineTakenDialog(medicineId, medicineName || 'Lek', medicineDosage || '');
      }
    });

    return () => {
      // Zatrzymaj wszystkie wibracje przy odmontowaniu komponentu (np. przy zamknięciu aplikacji)
      stopContinuousVibration();
      Notifications.removeNotificationSubscription(notificationListener.current);
      Notifications.removeNotificationSubscription(responseListener.current);
    };
  }, []);

  // Show dialog to mark medicine as taken
  const showMedicineTakenDialog = (medicineId: string, medicineName: string, medicineDosage: string) => {
    Alert.alert(
      'Przypomnienie o leku',
      `Czy zażyłeś lek ${medicineName} (${medicineDosage})?`,
      [
        {
          text: 'Pominięty',
          onPress: () => updateMedicineStatus(medicineId, medicineName, medicineDosage, 'skipped'),
          style: 'destructive'
        },
        {
          text: 'Zażyty',
          onPress: () => updateMedicineStatus(medicineId, medicineName, medicineDosage, 'taken'),
          style: 'default'
        }
      ],
      { cancelable: false }
    );
  };
  
  // Update medicine status in history
  const updateMedicineStatus = async (medicineId: string, name: string, dosage: string, status: 'taken' | 'skipped') => {
    try {
      // Zatrzymaj ciągłą wibrację po interakcji użytkownika
      stopContinuousVibration();
      
      // First get the medicine details
      const medicinesJson = await AsyncStorage.getItem('medicines');
      if (medicinesJson) {
        const medicines = JSON.parse(medicinesJson);
        const medicine = medicines.find(m => m.id === medicineId);
        
        if (medicine) {
          // Update in history
          await recordMedicineDose(medicine, status, new Date());
          
          // Jeśli lek został zażyty
          if (status === 'taken') {
            let needsUpdate = false;
            
            // Dla leków jednorazowych, oznacz jako ukończone
            if (!medicine.isRegular) {
              medicine.completed = true;
              needsUpdate = true;
            }
            // Dla regularnych, zmniejsz ilość tabletek
            else if (medicine.quantity !== undefined && medicine.quantity > 0) {
              medicine.quantity -= 1;
              needsUpdate = true;
              
              // Sprawdź czy ilość jest mała
              if (medicine.quantity < 5) {
                Alert.alert(
                  'Lek się kończy!',
                  `Zostało tylko ${medicine.quantity} ${
                    medicine.quantity === 1 ? 'tabletka' : 
                    (medicine.quantity > 1 && medicine.quantity < 5) ? 'tabletki' : 'tabletek'
                  } leku ${medicine.name}.`,
                  [{ text: 'OK' }]
                );
              }
            }
            
            // Zapisz zaktualizowane dane
            if (needsUpdate) {
              await AsyncStorage.setItem('medicines', JSON.stringify(medicines));
            }
          }
        } else {
          // Create temporary medicine object if not found
          const tempMedicine = {
            id: medicineId,
            name: name,
            dosage: dosage
          };
          await recordMedicineDose(tempMedicine, status, new Date());
        }
        
        if (status === 'taken') {
          Alert.alert('Świetnie!', 'Lek został oznaczony jako zażyty.');
        } else {
          Alert.alert('Rozumiem', 'Lek został oznaczony jako pominięty.');
        }
      }
    } catch (error) {
      console.error('Error updating medicine status:', error);
    }
  };

  async function registerForPushNotificationsAsync() {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      // Only ask if permissions have not already been determined
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        Alert.alert(
          'Uwaga', 
          'Aby otrzymywać przypomnienia o lekach, włącz powiadomienia dla aplikacji w ustawieniach urządzenia.'
        );
        return;
      }
    } catch (error) {
      console.log('Error requesting notification permissions:', error);
    }
  }

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ focused, color, size }) => {
            let iconName;

            switch (route.name) {
              case 'MedicinesTab':
                iconName = focused ? 'medical' : 'medical-outline';
                break;
              case 'Reminders':
                iconName = focused ? 'notifications' : 'notifications-outline';
                break;
              case 'History':
                iconName = focused ? 'calendar' : 'calendar-outline';
                break;
              case 'Settings':
                iconName = focused ? 'settings' : 'settings-outline';
                break;
              default:
                iconName = 'help';
            }

            return <Ionicons name={iconName} size={size} color={color} />;
          },
        })}
      >
        <Tab.Screen 
          name="MedicinesTab" 
          component={MedicinesStackScreen} 
          options={{ headerShown: false, tabBarLabel: 'Leki' }}
        />
        <Tab.Screen 
          name="Reminders" 
          component={RemindersScreen} 
          options={{ title: 'Przypomnienia' }}
        />
        <Tab.Screen 
          name="History" 
          component={HistoryScreen} 
          options={{ title: 'Historia' }}
        />
        <Tab.Screen 
          name="Settings" 
          component={SettingsScreen} 
          options={{ title: 'Ustawienia' }}
        />
      </Tab.Navigator>
      <StatusBar style="auto" />
    </NavigationContainer>
  );
}
