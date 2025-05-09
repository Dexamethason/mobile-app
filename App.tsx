import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { Alert, Platform } from 'react-native';
import { recordMedicineDose } from './src/utils/historyService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StackScreenProps } from '@react-navigation/stack';

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

// Define type declarations for navigation
export type MedicinesStackParamList = {
  Medicines: undefined;
  MedicineDetails: { medicineId: string };
  AddEditMedicine: { medicine?: any };
};

export type TabParamList = {
  MedicinesTab: undefined;
  Reminders: undefined;
  History: undefined;
  Settings: undefined;
};

// Define types for screen props
export type MedicinesScreenProps = StackScreenProps<MedicinesStackParamList, 'Medicines'>;
export type MedicineDetailsScreenProps = StackScreenProps<MedicinesStackParamList, 'MedicineDetails'>;
export type AddEditMedicineScreenProps = StackScreenProps<MedicinesStackParamList, 'AddEditMedicine'>;

const Tab = createBottomTabNavigator<TabParamList>();
const MedicinesStack = createStackNavigator<MedicinesStackParamList>();

function MedicinesStackScreen() {
  return (
    <MedicinesStack.Navigator>
      <MedicinesStack.Screen 
        name="Medicines" 
        component={MedicinesListScreen} 
        options={{ title: 'Lista leków' }} 
      />
      <MedicinesStack.Screen 
        name="MedicineDetails" 
        component={MedicineDetailsScreen as React.ComponentType<any>} 
        options={{ title: 'Szczegóły leku' }} 
      />
      <MedicinesStack.Screen 
        name="AddEditMedicine" 
        component={AddEditMedicineScreen as React.ComponentType<any>} 
        options={({ route }) => ({ 
          title: route.params?.medicine ? 'Edytuj lek' : 'Dodaj nowy lek' 
        })} 
      />
    </MedicinesStack.Navigator>
  );
}

export default function App() {
  const [notification, setNotification] = useState<Notifications.Notification | false>(false);
  const notificationListener = useRef<Notifications.Subscription | undefined>();
  const responseListener = useRef<Notifications.Subscription | undefined>();
  
  useEffect(() => {
    // Request notification permissions on app start
    registerForPushNotificationsAsync();
    
    // This listener is triggered when a notification is received while the app is in the foreground
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      setNotification(notification);
      
      // Show a dialog when notification is received in foreground
      const medicineId = notification.request.content.data?.medicineId as string;
      const medicineName = notification.request.content.data?.medicineName as string;
      const medicineDosage = notification.request.content.data?.medicineDosage as string;
      
      if (medicineId) {
        showMedicineTakenDialog(medicineId, medicineName || 'Lek', medicineDosage || '');
      }
    });

    // This listener is triggered when a user taps on a notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const medicineId = response.notification.request.content.data?.medicineId as string;
      const medicineName = response.notification.request.content.data?.medicineName as string;
      const medicineDosage = response.notification.request.content.data?.medicineDosage as string;
      
      if (medicineId) {
        showMedicineTakenDialog(medicineId, medicineName || 'Lek', medicineDosage || '');
      }
    });

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
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
      // First get the medicine details
      const medicinesJson = await AsyncStorage.getItem('medicines');
      if (medicinesJson) {
        const medicines = JSON.parse(medicinesJson);
        const medicine = medicines.find((m: any) => m.id === medicineId);
        
        if (medicine) {
          // Update in history
          await recordMedicineDose(medicine, status, new Date());
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
            let iconName: keyof typeof Ionicons.glyphMap = 'help';

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
          component={RemindersScreen as React.ComponentType<any>} 
          options={{ title: 'Przypomnienia' }}
        />
        <Tab.Screen 
          name="History" 
          component={HistoryScreen as React.ComponentType<any>} 
          options={{ title: 'Historia' }}
        />
        <Tab.Screen 
          name="Settings" 
          component={SettingsScreen as React.ComponentType<any>} 
          options={{ title: 'Ustawienia' }}
        />
      </Tab.Navigator>
      <StatusBar style="auto" />
    </NavigationContainer>
  );
}