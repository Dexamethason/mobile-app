import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

// interfejs dla leku
interface Medicine {
  id: string;
  name: string;
  dosage: string;
  isRegular: boolean;
  oneTimeDate: string;
  oneTimeTime: string;
}

// ustawienia handlera 
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// funkcja do planowania powiadomień (jednorazowe leki)
export const scheduleOneTimeMedicineNotification = async (medicine: Medicine) => {
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
      console.log('Brak uprawnień do powiadomień');
      return;
    }

    // data powiadomienia
    const notificationDate = new Date(medicine.oneTimeDate);
    const [hours, minutes] = medicine.oneTimeTime.split(':');
    notificationDate.setHours(parseInt(hours), parseInt(minutes), 0);

    // sprawdzamy czy nie w przeszłości
    if (notificationDate <= new Date()) {
      console.log('Data powiadomienia jest z przeszłości');
      return;
    }

    // Planujemy powiadomienie
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

    // zapisujemy id
    const notificationsMap = await AsyncStorage.getItem('medicineNotifications') || '{}';
    const notifications = JSON.parse(notificationsMap);
    notifications[medicine.id] = notificationId;
    await AsyncStorage.setItem('medicineNotifications', JSON.stringify(notifications));

    return notificationId;
  } catch (error) {
    console.error('Błąd podczas planowania powiadomienia:', error);
  }
};

// anulowanie powiadomień
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

// aktualizacja powiadomień
export const updateMedicineNotification = async (medicine: Medicine) => {
  try {
    // najpierw usuwamy stare
    await cancelMedicineNotification(medicine.id);
    
    // jak jednorazowy to planujemy nowe
    if (!medicine.isRegular) {
      await scheduleOneTimeMedicineNotification(medicine);
    }
  } catch (error) {
    console.error('Błąd podczas aktualizacji powiadomienia:', error);
  }
};