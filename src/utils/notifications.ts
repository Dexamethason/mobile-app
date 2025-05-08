import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Interfejs dla obiektu leku
interface Medicine {
  id: string;
  name: string;
  dosage: string;
  isRegular: boolean;
  oneTimeDate: string;
  oneTimeTime: string;
}

// Konfiguracja handlera powiadomień
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Funkcja do planowania powiadomienia dla leku jednorazowego
export const scheduleOneTimeMedicineNotification = async (medicine: Medicine) => {
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
      console.log('Brak uprawnień do powiadomień');
      return;
    }

    // Utwórz datę powiadomienia
    const notificationDate = new Date(medicine.oneTimeDate);
    const [hours, minutes] = medicine.oneTimeTime.split(':');
    notificationDate.setHours(parseInt(hours), parseInt(minutes), 0);

    // Sprawdź czy data nie jest z przeszłości
    if (notificationDate <= new Date()) {
      console.log('Data powiadomienia jest z przeszłości');
      return;
    }

    // Zaplanuj powiadomienie
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: `Czas na lek: ${medicine.name}`,
        body: `Dawka: ${medicine.dosage}`,
        data: { 
          medicineId: medicine.id,
          medicineName: medicine.name,
          medicineDosage: medicine.dosage
        },
      },
      trigger: {
        date: notificationDate,
        type: 'date',
      },
    });

    // Zapisz ID powiadomienia
    const notificationsMap = await AsyncStorage.getItem('medicineNotifications') || '{}';
    const notifications = JSON.parse(notificationsMap);
    notifications[medicine.id] = notificationId;
    await AsyncStorage.setItem('medicineNotifications', JSON.stringify(notifications));

    return notificationId;
  } catch (error) {
    console.error('Błąd podczas planowania powiadomienia:', error);
  }
};

// Funkcja do anulowania powiadomienia dla leku
export const cancelMedicineNotification = async (medicineId: string) => {
  try {
    const notificationsMap = await AsyncStorage.getItem('medicineNotifications') || '{}';
    const notifications = JSON.parse(notificationsMap);
    
    if (notifications[medicineId]) {
      await Notifications.cancelScheduledNotificationAsync(notifications[medicineId]);
      delete notifications[medicineId];
      await AsyncStorage.setItem('medicineNotifications', JSON.stringify(notifications));
    }
  } catch (error) {
    console.error('Błąd podczas anulowania powiadomienia:', error);
  }
};

// Funkcja do aktualizacji powiadomienia dla leku
export const updateMedicineNotification = async (medicine: Medicine) => {
  try {
    // Najpierw anuluj istniejące powiadomienie
    await cancelMedicineNotification(medicine.id);
    
    // Jeśli to lek jednorazowy, zaplanuj nowe powiadomienie
    if (!medicine.isRegular) {
      await scheduleOneTimeMedicineNotification(medicine);
    }
  } catch (error) {
    console.error('Błąd podczas aktualizacji powiadomienia:', error);
  }
};