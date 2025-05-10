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
  times?: string[];
  selectedDays?: boolean[];
}

// ustawienia handlera 
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// zapis klucza powiązań leków z powiadomieniami
const NOTIFICATION_MAP_KEY = 'medicineNotifications';

// harmonogram powiadomień – dla jednorazowego
export const scheduleOneTimeMedicineNotification = async (medicine: Medicine) => {
  const date = new Date(medicine.oneTimeDate);
  const [hours, minutes] = medicine.oneTimeTime.split(':');
  date.setHours(parseInt(hours), parseInt(minutes), 0, 0);

  if (date <= new Date()) return;

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: `Czas na lek: ${medicine.name}`,
      body: `Dawka: ${medicine.dosage}`,
      data: {
        medicineId: medicine.id,
        medicineName: medicine.name,
        medicineDosage: medicine.dosage,
      },
    },
    trigger: date,
  });

  await saveNotificationId(medicine.id, id);
  return id;
};

// harmonogram powiadomień – dla regularnego
export const scheduleRegularMedicineNotifications = async (medicine: Medicine) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    const weekday = date.getDay(); // 0 - niedziela

    if (!medicine.selectedDays?.[weekday]) continue;

    for (const time of medicine.times || []) {
      const [hours, minutes] = time.split(':');
      const triggerTime = new Date(date);
      triggerTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      if (triggerTime > new Date()) {
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: `Czas na lek: ${medicine.name}`,
            body: `Dawka: ${medicine.dosage}`,
            data: {
              medicineId: medicine.id,
              medicineName: medicine.name,
              medicineDosage: medicine.dosage,
            },
          },
          trigger: triggerTime,
        });

        await saveNotificationId(medicine.id, id);
      }
    }
  }
};

// zapisuje identyfikatory powiadomień dla danego leku
const saveNotificationId = async (medicineId: string, notificationId: string) => {
  const raw = await AsyncStorage.getItem(NOTIFICATION_MAP_KEY);
  const map = raw ? JSON.parse(raw) : {};
  if (!map[medicineId]) map[medicineId] = [];
  map[medicineId].push(notificationId);
  await AsyncStorage.setItem(NOTIFICATION_MAP_KEY, JSON.stringify(map));
};

// anulowanie powiadomień dla danego leku
export const cancelMedicineNotification = async (medicineId: string) => {
  const raw = await AsyncStorage.getItem(NOTIFICATION_MAP_KEY);
  const map = raw ? JSON.parse(raw) : {};

  if (map[medicineId]) {
    for (const notifId of map[medicineId]) {
      await Notifications.cancelScheduledNotificationAsync(notifId);
    }
    delete map[medicineId];
    await AsyncStorage.setItem(NOTIFICATION_MAP_KEY, JSON.stringify(map));
  }
};

// aktualizacja powiadomień
export const updateMedicineNotification = async (medicine: Medicine) => {
  try {
    await cancelMedicineNotification(medicine.id);

    if (medicine.isRegular) {
      await scheduleRegularMedicineNotifications(medicine);
    } else {
      await scheduleOneTimeMedicineNotification(medicine);
    }
  } catch (error) {
    console.error('Błąd podczas aktualizacji powiadomień:', error);
  }
};
