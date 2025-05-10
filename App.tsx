import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { Alert, Platform, Vibration, TouchableOpacity, View, Text, AppState } from 'react-native';
import { recordMedicineDose } from './src/utils/historyService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocalDateString } from './src/utils/dateUtils';

// Importowanie ekranów
import MedicinesListScreen from './src/screens/MedicinesListScreen';
import MedicineDetailsScreen from './src/screens/MedicineDetailsScreen';
import AddEditMedicineScreen from './src/screens/AddEditMedicineScreen';
import RemindersScreen from './src/screens/RemindersScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import SettingsScreen from './src/screens/SettingsScreen';

// Konfiguracja powiadomień
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const Tab = createBottomTabNavigator();
const MedicinesStack = createStackNavigator();

// Konfiguracja wibracji
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
    // iOS podobno nie ma ciągłej wibracji, więc interwał wlatuje
    vibrationIntervalId = setInterval(() => {
      Vibration.vibrate(VIBRATION_PATTERN);
    }, 4000); // Powtarza co 4 sek
    
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
  const [pendingNotification, setPendingNotification] = useState(null);
  const [appOpenedFromNotification, setAppOpenedFromNotification] = useState(false);
  const appState = useRef(AppState.currentState);
  const [handledNotifications, setHandledNotifications] = useState<string[]>([]);
  const [lastNotificationId, setLastNotificationId] = useState<string | null>(null);
  
  useEffect(() => {
    // Rejestruj uprawnienia do powiadomień przy starcie aplikacji
    registerForPushNotificationsAsync();
    
    // Sprawdź, czy aplikacja została uruchomiona z powiadomienia
    const checkLaunchNotification = async () => {
      try {
        const lastNotification = await Notifications.getLastNotificationResponseAsync();
        if (lastNotification) {
          // Sprawdź czy to powiadomienie zostało już obsłużone
          const notificationId = lastNotification.notification.request.identifier;
          if (handledNotifications.includes(notificationId)) {
            console.log('To powiadomienie zostało już obsłużone, pomijam');
            return;
          }
          
          // Aplikacja została uruchomiona przez kliknięcie w powiadomienie
          console.log('Aplikacja została uruchomiona z powiadomienia');
          const data = lastNotification.notification.request.content.data;
          if (data && data.medicineId) {
            console.log('Przetwarzanie powiadomienia o leku, które uruchomiło aplikację');
            
            // Sprawdź czy dany lek nie został już wcześniej obsłużony w historii
            const alreadyHandled = await checkIfMedicineHandledRecently(
              data.medicineId, 
              new Date()
            );
            
            if (alreadyHandled) {
              console.log('Ten lek został już wcześniej obsłużony, pomijam');
              return;
            }
            
            // Zapisz oczekujące powiadomienie
            savePendingNotification(
              data.medicineId,
              data.medicineName || 'Lek',
              data.medicineDosage || ''
            );
            
            // Dodaj to powiadomienie do już obsłużonych
            setHandledNotifications(prev => [...prev, notificationId]);
            
            // Zwiększ opóźnienie, aby dać więcej czasu na inicjalizację po uruchomieniu
            // z zablokowanego ekranu
            setTimeout(() => {
              startContinuousVibration();
              showMedicineTakenDialog(
                data.medicineId,
                data.medicineName || 'Lek',
                data.medicineDosage || ''
              );
            }, 1500); // Zwiększone z 500ms do 1500ms
          }
        }
      } catch (error) {
        console.error('Błąd podczas sprawdzania powiadomienia uruchamiającego:', error);
      }
    };
    
    // Wywołaj checkLaunchNotification po krótkim opóźnieniu,
    // aby dać czas na pełne załadowanie aplikacji
    setTimeout(() => {
      checkLaunchNotification();
    }, 800);
    
    // Sprawdź oczekujące powiadomienia zapisane w AsyncStorage
    const checkPendingNotifications = async () => {
      try {
        const pendingJson = await AsyncStorage.getItem('pendingNotification');
        if (pendingJson) {
          const pending = JSON.parse(pendingJson);
          // Sprawdź czy istnieje zapis w historii o zażyciu tego leku w ostatnich 5 minutach
          const alreadyTakenOrSkipped = await checkIfMedicineHandledRecently(
            pending.medicineId, 
            new Date(pending.timestamp)
          );
          
          // Obsługuj tylko jeśli jest niedawne (w ciągu ostatnich 5 minut) i nie zostało już obsłużone
          if (Date.now() - pending.timestamp < 300000 && !alreadyTakenOrSkipped) {
            setPendingNotification(pending);
            // Pokaż dialog dla oczekującego powiadomienia
            showMedicineTakenDialog(
              pending.medicineId, 
              pending.medicineName || 'Lek', 
              pending.medicineDosage || ''
            );
            startContinuousVibration();
          } else {
            // Wyczyść stare lub już obsłużone oczekujące powiadomienia
            await AsyncStorage.removeItem('pendingNotification');
          }
        }
      } catch (error) {
        console.error('Błąd podczas sprawdzania oczekujących powiadomień:', error);
      }
    };
    
    // Funkcja do sprawdzenia, czy lek został już obsłużony w ostatnim czasie
    const checkIfMedicineHandledRecently = async (medicineId: string, notificationTime: Date) => {
      try {
        // Pobierz historię
        const historyJson = await AsyncStorage.getItem('medicineHistory');
        if (!historyJson) return false;
        
        const history = JSON.parse(historyJson);
        const today = new Date();
        const todayString = getLocalDateString ? getLocalDateString(today) : today.toISOString().split('T')[0];
        
        // Sprawdź wpisy z dzisiaj
        const todayEntries = history[todayString] || [];
        
        // Szukaj wpisów dla tego leku z ostatnich 30 minut (zwiększone z 10), które mają status inny niż "planned"
        const recentEntry = todayEntries.find(entry => {
          if (!entry.id.startsWith(`${medicineId}_`)) return false;
          if (entry.status === 'planned') return false;
          
          // Sprawdź czy wpis jest z ostatnich 30 minut
          const entryTime = new Date(entry.timestamp);
          const currentTime = new Date();
          const timeDiff = Math.abs(entryTime.getTime() - currentTime.getTime());
          
          return timeDiff < 30 * 60 * 1000; // 30 minut
        });
        
        return !!recentEntry; // Zwróć true jeśli znaleziono taki wpis
      } catch (error) {
        console.error('Błąd sprawdzania historii leku:', error);
        return false;
      }
    };
    
    // Uruchom sprawdzenie natychmiast po starcie aplikacji
    checkPendingNotifications();
    
    // Nasłuchuj zmian stanu aplikacji (tło/pierwszy plan)
    const appStateListener = AppState.addEventListener('change', nextAppState => {
      // Aplikacja przeszła na pierwszy plan
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        console.log('Aplikacja przeszła na pierwszy plan');
        // Sprawdź czy istnieje pendingNotification w pamięci
        // i czy trzeba pokazać dialog - ale najpierw poczekaj moment
        setTimeout(async () => {
          // Pobierz aktualne pendingNotification
          const pendingJson = await AsyncStorage.getItem('pendingNotification');
          if (pendingJson) {
            const pending = JSON.parse(pendingJson);
            
            // Sprawdź czy lek został już obsłużony w ostatnim czasie
            const alreadyHandled = await checkIfMedicineHandledRecently(
              pending.medicineId,
              new Date(pending.timestamp)
            );
            
            if (alreadyHandled) {
              console.log('Ten lek został już obsłużony, usuwam oczekujące powiadomienie');
              await AsyncStorage.removeItem('pendingNotification');
              setPendingNotification(null);
              stopContinuousVibration();
            } else {
              // Jeśli nie było już obsługiwane, wykonaj standardowe sprawdzenia
              checkLaunchNotification();
              checkPendingNotifications();
            }
          } else {
            // Jeśli nie ma oczekujących powiadomień, wykonaj standardowe sprawdzenia
            checkLaunchNotification();
            checkPendingNotifications();
          }
        }, 500);
      }
      appState.current = nextAppState;
    });
    
    // Ten listener jest uruchamiany, gdy powiadomienie jest odbierane, gdy aplikacja jest na pierwszym planie
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      setNotification(notification);
      
      // Zapisz ID powiadomienia
      setLastNotificationId(notification.request.identifier);
      
      // Pokaż dialog, gdy powiadomienie jest odbierane na pierwszym planie
      const medicineId = notification.request.content.data?.medicineId;
      const medicineName = notification.request.content.data?.medicineName;
      const medicineDosage = notification.request.content.data?.medicineDosage;
      
      if (medicineId) {
        // Zapisz to jako oczekujące powiadomienie na wypadek, gdyby dialog został pominięty
        savePendingNotification(medicineId, medicineName, medicineDosage);
        startContinuousVibration();
        showMedicineTakenDialog(medicineId, medicineName || 'Lek', medicineDosage || '');
      }
    });

    // Ten listener jest uruchamiany, gdy użytkownik klika w powiadomienie
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Kliknięto powiadomienie!', response.notification.request.identifier);
      setAppOpenedFromNotification(true);
      
      // Zapisz ID powiadomienia
      setLastNotificationId(response.notification.request.identifier);
      
      const medicineId = response.notification.request.content.data?.medicineId;
      const medicineName = response.notification.request.content.data?.medicineName;
      const medicineDosage = response.notification.request.content.data?.medicineDosage;
      
      if (medicineId) {
        // Zapisz to jako oczekujące powiadomienie na wypadek, gdyby dialog został odrzucony
        savePendingNotification(medicineId, medicineName, medicineDosage);
        
        // Zwiększ opóźnienie, aby upewnić się, że aplikacja jest w pełni na pierwszym planie
        setTimeout(() => {
          startContinuousVibration();
          showMedicineTakenDialog(medicineId, medicineName || 'Lek', medicineDosage || '');
        }, 1000); // Zwiększone z 300ms do 1000ms
      }
    });

    return () => {
      // Zatrzymaj wszystkie wibracje przy odmontowaniu komponentu
      stopContinuousVibration();
      Notifications.removeNotificationSubscription(notificationListener.current);
      Notifications.removeNotificationSubscription(responseListener.current);
      appStateListener.remove();
    };
  }, [handledNotifications]);

  const savePendingNotification = async (medicineId, medicineName, medicineDosage) => {
    try {
      const pendingData = {
        medicineId,
        medicineName,
        medicineDosage,
        timestamp: Date.now()
      };
      await AsyncStorage.setItem('pendingNotification', JSON.stringify(pendingData));
    } catch (error) {
      console.error('Błąd podczas zapisywania oczekującego powiadomienia:', error);
    }
  };

  // Pokaż dialog do oznaczenia leku jako zażytego
  const showMedicineTakenDialog = (medicineId: string, medicineName: string, medicineDosage: string) => {
    // Wymuś wyświetlenie oczekującego powiadomienia na wypadek, gdyby alert został przypadkowo odrzucony
    setPendingNotification({
      medicineId,
      medicineName,
      medicineDosage,
      timestamp: Date.now()
    });
    
    // Upewnij się, że wibracja działa
    startContinuousVibration();
    
    Alert.alert(
      `Czas na lek: ${medicineName}`,
      `Dawka: ${medicineDosage}`,
      [
        {
          text: 'Odłóż',
          onPress: () => {
            // Zachowaj oczekujące powiadomienie na później, ale nie zatrzymuj wibracji
            console.log('Przypomnienie o leku odłożone');
          },
          style: 'cancel',
        },
        {
          text: 'Zażyty',
          onPress: async () => {
            // Zatrzymaj wibrację
            stopContinuousVibration();
            
            // Wyczyść oczekujące powiadomienie, ponieważ użytkownik odpowiedział
            await AsyncStorage.removeItem('pendingNotification');
            setPendingNotification(null); // Bardzo ważne - to usunie baner!
            
            // Dodaj ID powiadomienia do listy obsłużonych
            if (lastNotificationId) {
              setHandledNotifications(prev => [...prev, lastNotificationId]);
            }
            
            await updateMedicineStatus(medicineId, medicineName, medicineDosage, 'taken');
          },
        },
        {
          text: 'Pominięty',
          onPress: async () => {
            // Zatrzymaj wibrację
            stopContinuousVibration();
            
            // Wyczyść oczekujące powiadomienie, ponieważ użytkownik odpowiedział
            await AsyncStorage.removeItem('pendingNotification');
            setPendingNotification(null); // Bardzo ważne - to usunie baner!
            
            // Dodaj ID powiadomienia do listy obsłużonych
            if (lastNotificationId) {
              setHandledNotifications(prev => [...prev, lastNotificationId]);
            }
            
            await updateMedicineStatus(medicineId, medicineName, medicineDosage, 'skipped');
          },
        },
      ],
      { 
        cancelable: false, // Zapobiega odrzuceniu przez kliknięcie poza alertem
      }
    );
  };
  
  // Aktualizuj status leku w historii
  const updateMedicineStatus = async (medicineId: string, name: string, dosage: string, status: 'taken' | 'skipped') => {
    try {
      // Zatrzymaj ciągłą wibrację po interakcji użytkownika
      stopContinuousVibration();
      
      // Wyczyść oczekujące powiadomienie
      await AsyncStorage.removeItem('pendingNotification');
      setPendingNotification(null);
      
      // Najpierw pobierz szczegóły leku
      const medicinesJson = await AsyncStorage.getItem('medicines');
      if (medicinesJson) {
        const medicines = JSON.parse(medicinesJson);
        const medicine = medicines.find(m => m.id === medicineId);
        
        if (medicine) {
          // Aktualizuj w historii
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
          // Utwórz tymczasowy obiekt leku, jeśli nie znaleziono
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
      console.error('Błąd podczas aktualizacji statusu leku:', error);
    }
  };

  async function registerForPushNotificationsAsync() {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      // Pytaj tylko jeśli uprawnienia nie zostały jeszcze określone
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
      console.log('Błąd podczas żądania uprawnień do powiadomień:', error);
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
      {pendingNotification && (
        <TouchableOpacity
          style={{
            position: 'absolute',
            bottom: 80,
            left: 10,
            right: 10,
            backgroundColor: '#4a86e8',
            padding: 15,
            borderRadius: 10,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            elevation: 5,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.25,
            shadowRadius: 3.84,
          }}
          onPress={() => {
            // Pokaż dialog ponownie gdy użytkownik kliknie baner
            if (pendingNotification) {
              showMedicineTakenDialog(
                pendingNotification.medicineId,
                pendingNotification.medicineName || 'Lek',
                pendingNotification.medicineDosage || ''
              );
            }
          }}
        >
          <View>
            <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16 }}>
              Nieprzyjęty lek: {pendingNotification.medicineName}
            </Text>
            <Text style={{ color: 'white', marginTop: 4 }}>
              Dotknij, aby zarejestrować
            </Text>
          </View>
          <Ionicons name="alert-circle" size={30} color="white" />
        </TouchableOpacity>
      )}
    </NavigationContainer>
  );
}
