import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { formatDate, formatDateString, isDateInFuture, getDayName, getLocalDateString } from '../utils/dateUtils';
import { recordMedicineDose } from '../utils/historyService';

interface Reminder {
  id: string;
  medicineId: string;
  medicineName: string;
  medicineDosage: string;
  date: string;
  time: string;
  status: 'planned' | 'taken' | 'skipped';
  timestamp: string;
}

interface MedicineData {
  id: string;
  name: string;
  dosage: string;
  isRegular: boolean;
  times?: string[];
  selectedDays?: boolean[];
  oneTimeDate?: string;
  oneTimeTime?: string;
  quantity?: number;
  completed?: boolean;
}

interface GroupedReminders {
  title: string; 
  date: string;
  data: Reminder[];
}

const RemindersScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  // domyślnie filtr 'today' zamiast 'all'
  const [filter, setFilter] = useState<'today' | 'week' | 'all'>('today');
  const [groupedReminders, setGroupedReminders] = useState<GroupedReminders[]>([]);

  useEffect(() => {
    loadReminders();

    // focus listener żeby odświeżyć dane jak wracamy na ekran
    const unsubscribe = navigation.addListener('focus', () => {
      console.log('RemindersScreen focused - refreshing data');
      loadReminders();
    });
    
    return unsubscribe;
  }, [navigation]);

  // sprawdza zmiany w lekach
  useEffect(() => {
    const checkMedicineUpdates = async () => {
      try {
        const updateJson = await AsyncStorage.getItem('lastUpdatedMedicine');
        if (updateJson) {
          const update = JSON.parse(updateJson);
          
          // sprawdza czy aktualizacja jest świeża (ostatnie 3 sekundy)
          if (Date.now() - update.timestamp < 3000) {
            console.log(`Medicine was recently updated, reloading reminders...`);
            await AsyncStorage.removeItem('lastUpdatedMedicine');
            loadReminders();
          }
        }
      } catch (error) {
        console.error('Error checking medicine updates:', error);
      }
    };
    
    const interval = setInterval(checkMedicineUpdates, 1000);
    return () => clearInterval(interval);
  }, []);

  // efekt do aktualizacji grupowania przy zmianie filtra lub przypomnień
  useEffect(() => {
    groupRemindersByDate();
  }, [reminders, filter]);

const loadReminders = useCallback(async () => {
  try {
    setLoading(true);
    console.log("Loading reminders data...");

    // dane o lekach
    const medicinesJson = await AsyncStorage.getItem('medicines');
    const medicines: MedicineData[] = medicinesJson ? JSON.parse(medicinesJson) : [];
    
    if (medicines.length === 0) {
      setReminders([]);
      setLoading(false);
      return;
    }

    // check historii żeby sprawdzić status
    const historyJson = await AsyncStorage.getItem('medicineHistory');
    const history = historyJson ? JSON.parse(historyJson) : {};

    // generujemy przypomnienia na 7 dni dla regularnych i wszystkie dla jednorazowych
    const today = new Date();
    const todayAtMidnight = new Date(today);
    todayAtMidnight.setHours(0, 0, 0, 0);
    
    const nextWeek = new Date(todayAtMidnight);
    nextWeek.setDate(nextWeek.getDate() + 7);

    const generatedReminders: Reminder[] = [];
    
    // Używamy lokalnego formatu daty zamiast ISO
    const todayString = getLocalDateString(todayAtMidnight);
    console.log(`Generating reminders, today (local): ${todayString}`);
    
    // Dla regularnych leków, generujemy 7 dni do przodu
    // Dla jednorazowych, generujemy wszystkie, nawet te oddalone w czasie
    
    for (const medicine of medicines) {
      if (medicine.isRegular) {
        // obsługa regularnych leków - 7 dni
        for (let i = 0; i < 7; i++) {
          const date = new Date(todayAtMidnight);
          date.setDate(date.getDate() + i);
          
          // sprawdź czy ten dzień jest wybrany
          const dayOfWeek = date.getDay(); 
          if (!medicine.selectedDays || !medicine.selectedDays[dayOfWeek]) {
            continue;
          }
          
          // sprawdzamy czy są czasy przypomnień
          if (medicine.times && medicine.times.length > 0) {
            for (const time of medicine.times) {
              // istniejący kod dla regularnych leków
              // ...
            }
          }
        }
      } else {
        // obsługa jednorazowych leków - bez limitu dat
        if (medicine.oneTimeDate) {
          const medicineDate = new Date(medicine.oneTimeDate);
          medicineDate.setHours(0, 0, 0, 0);
          
          // Usuwamy limit 7 dni - pokazujemy wszystkie jednorazowe leki
          // także te w odległej przyszłości dla widoku "wszystkie"
          // if (medicineDate >= todayAtMidnight && medicineDate <= nextWeek) {
          
          // Pokazujemy wszystkie przyszłe i dzisiejsze jednorazowe leki
          if (medicineDate >= todayAtMidnight) {
            // Używamy lokalnego formatu daty
            const dateString = getLocalDateString(medicineDate);
            
            // sprawdzamy czy to dzisiejsza data
            const isToday = dateString === todayString;
            if (isToday) {
              console.log(`One-time medicine for today (local date): ${medicine.name}, date: ${dateString}`);
            }
            
            // Ustaw czas do porównania statusu
            const medicineTime = new Date(medicineDate);
            const [hours, minutes] = medicine.oneTimeTime.split(':');
            medicineTime.setHours(parseInt(hours), parseInt(minutes));
            const isPast = medicineTime < today;
            
            // sprawdzamy status w historii
            let status: 'planned' | 'taken' | 'skipped' = 'planned';
            if (history && history[dateString]) {
              // szukamy pasującego wpisu
              const historyRecord = history[dateString]?.find(record => 
                record.id.startsWith(`${medicine.id}_`)
              );
              
              if (historyRecord) {
                status = historyRecord.status as 'planned' | 'taken' | 'skipped';
              } else if (isPast) {
                status = 'skipped';
              }
            } else if (isPast) {
              status = 'skipped';
            }
            
            // nowe przypomnienie
            generatedReminders.push({
              id: `${medicine.id}_${dateString}_${medicine.oneTimeTime}`,
              medicineId: medicine.id,
              medicineName: medicine.name,
              medicineDosage: medicine.dosage,
              date: dateString,
              time: medicine.oneTimeTime || '00:00',
              status,
              timestamp: medicineTime.toISOString()
            });
          }
        }
      }
    }
    
    // sort po dacie i czasie
    generatedReminders.sort((a, b) => {
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    });
    
    // Sprawdź ile przypomnień jest na dzisiaj
    const todayReminders = generatedReminders.filter(r => r.date === todayString);
    console.log(`Generated ${generatedReminders.length} total reminders, ${todayReminders.length} for today (local date: ${todayString})`);
    
    setReminders(generatedReminders);
    
  } catch (error) {
    console.error('Error loading reminders:', error);
    Alert.alert('Błąd', 'Nie udało się wczytać przypomnień.');
  } finally {
    setLoading(false);
  }
}, []);
  
  const groupRemindersByDate = () => {
    if (!reminders || reminders.length === 0) {
      setGroupedReminders([]);
      return;
    }
    
    // Utwórz dzisiejszą datę w odpowiednim formacie
    const today = new Date();
    const todayAtMidnight = new Date(today);
    todayAtMidnight.setHours(0, 0, 0, 0);
    
    const nextWeek = new Date(todayAtMidnight);
    nextWeek.setDate(nextWeek.getDate() + 7);
    
    // Konwersja do formatu lokalnego daty
    const todayString = getLocalDateString(todayAtMidnight);
    
    // Tworzenie lokalnych stringów dat dla kolejnych 7 dni
    const datesToCheck: string[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(todayAtMidnight);
      date.setDate(date.getDate() + i);
      datesToCheck.push(getLocalDateString(date));
    }
    
    const nextWeekString = getLocalDateString(nextWeek);
    
    console.log(`Today string for filtering (local): ${todayString}, Next week: ${nextWeekString}`);
    
    let filteredReminders = [...reminders];
    
    if (filter === 'today') {
      // Wyświetlaj debugowanie dat dla zrozumienia problemu
      console.log(`Today string (local): ${todayString}`);
      reminders.forEach(r => {
        console.log(`Reminder date: ${r.date}, is today: ${r.date === todayString}`);
      });
      
      // Filtrowanie dla dzisiejszych dat - używamy dokładnie takiego samego formatu jak podczas tworzenia przypomnień
      filteredReminders = reminders.filter(r => r.date === todayString);
      console.log(`Filtered today's reminders: ${filteredReminders.length}`);
    } else if (filter === 'week') {
      // Używamy tablicy lokalnych dat do filtrowania widoku tygodnia
      filteredReminders = reminders.filter(r => datesToCheck.includes(r.date));
      
      // Logowanie dla debugowania
      const todayInWeekView = filteredReminders.filter(r => r.date === todayString).length;
      console.log(`Week view contains ${todayInWeekView} reminders for today`);
    } else if (filter === 'all') {
      // Dla widoku "wszystkie" nie filtrujemy - pokazujemy wszystkie dostępne przypomnienia
      console.log(`All view contains ${reminders.length} reminders total`);
    }
    
    // grupujemy po dacie
    const groups = filteredReminders.reduce((acc: Record<string, Reminder[]>, reminder) => {
      if (!acc[reminder.date]) {
        acc[reminder.date] = [];
      }
      acc[reminder.date].push(reminder);
      return acc;
    }, {});
    
    // konwersja na tablicę + tytuł
    const tomorrowAtMidnight = new Date(todayAtMidnight);
    tomorrowAtMidnight.setDate(tomorrowAtMidnight.getDate() + 1);
    const tomorrowString = getLocalDateString(tomorrowAtMidnight);
    
    console.log(`Today string (local): ${todayString}, Tomorrow string (local): ${tomorrowString}`);
    
    const groupArray: GroupedReminders[] = Object.keys(groups).map(date => {
      let title = '';
      if (date === todayString) {
        title = 'Dzisiaj';
      } else if (date === tomorrowString) {
        title = 'Jutro';
      } else {
        // Konwersja stringa daty do obiektu Date
        const [year, month, day] = date.split('-').map(Number);
        const dateObj = new Date(year, month - 1, day); // miesiące w JS są 0-indeksowane
        const dayName = getDayName(dateObj);
        title = `${dayName}, ${formatDateString(date)}`;
      }
      
      console.log(`Group for date ${date}: ${title}`);
      
      return {
        title,
        date,
        data: groups[date]
      };
    });
    
    // sortujemy po dacie - tu też musimy konwertować stringi do dat
    groupArray.sort((a, b) => {
      const [aYear, aMonth, aDay] = a.date.split('-').map(Number);
      const [bYear, bMonth, bDay] = b.date.split('-').map(Number);
      const dateA = new Date(aYear, aMonth - 1, aDay);
      const dateB = new Date(bYear, bMonth - 1, bDay);
      return dateA.getTime() - dateB.getTime();
    });
    
    console.log(`Grouped reminders: ${groupArray.length} groups`);
    for (const group of groupArray) {
      console.log(`Group: ${group.title}, items: ${group.data.length}`);
    }
    
    setGroupedReminders(groupArray);
  };
  
  const updateReminderStatus = async (reminder: Reminder, newStatus: 'taken' | 'skipped') => {
    try {
      const medicineData = {
        id: reminder.medicineId,
        name: reminder.medicineName,
        dosage: reminder.medicineDosage
      };
      
      // bierzemy timestamp z przypomnienia
      const reminderTime = new Date(reminder.timestamp);
      
      // aktualizacja w historii
      await recordMedicineDose(medicineData, newStatus, reminderTime);
      
      // Jeśli status to "taken", aktualizujemy dane leku
      if (newStatus === 'taken') {
        // Pobierz dane leków
        const medicinesJson = await AsyncStorage.getItem('medicines');
        if (medicinesJson) {
          const medicines = JSON.parse(medicinesJson);
          const medicineIndex = medicines.findIndex(med => med.id === reminder.medicineId);
          
          if (medicineIndex !== -1) {
            const medicine = medicines[medicineIndex];
            let needsUpdate = false;
            
            // Dla leków jednorazowych, oznacz jako ukończone
            if (!medicine.isRegular) {
              medicine.completed = true;
              needsUpdate = true;
            }
            // Dla regularnych leków, zmniejsz ilość tabletek
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
        }
      }
      
      // odświeżenie przypomnień
      await loadReminders();
      
    } catch (error) {
      console.error('Error updating reminder status:', error);
      Alert.alert('Błąd', 'Nie udało się zaktualizować statusu leku.');
    }
  };
  
  const showStatusChangeDialog = (reminder: Reminder) => {
    // sprawdzamy czy to przypomnienie jest w przyszłości
    if (new Date(reminder.timestamp) > new Date()) {
      Alert.alert('Informacja', 'Nie można zmienić statusu dla zaplanowanych leków.');
      return;
    }
    
    Alert.alert(
      'Oznacz status leku',
      `${reminder.medicineName}, ${reminder.medicineDosage}`,
      [
        {
          text: 'Anuluj',
          style: 'cancel'
        },
        {
          text: 'Zażyty',
          onPress: () => updateReminderStatus(reminder, 'taken')
        },
        {
          text: 'Pominięty',
          onPress: () => updateReminderStatus(reminder, 'skipped')
        }
      ]
    );
  };
  
  const renderReminderItem = ({ item }: { item: Reminder }) => {
    const isUpcoming = new Date(item.timestamp) > new Date();
    
    // określamy styl i tekst statusu
    let statusStyle, statusText;
    if (isUpcoming) {
      statusStyle = styles.statusPlanned;
      statusText = 'Zaplanowany';
    } else {
      switch (item.status) {
        case 'taken':
          statusStyle = styles.statusTaken;
          statusText = 'Zażyty';
          break;
        case 'skipped':
          statusStyle = styles.statusSkipped;
          statusText = 'Pominięty';
          break;
        default:
          statusStyle = styles.statusSkipped;
          statusText = 'Pominięty';
          break;
      }
    }
    
    return (
      <TouchableOpacity 
        style={styles.reminderItem} 
        onPress={() => showStatusChangeDialog(item)}
      >
        <View style={styles.reminderTime}>
          <Text style={styles.timeText}>{item.time}</Text>
          <Text style={styles.dateText}>{formatDateString(item.date)}</Text>
        </View>
        <View style={styles.reminderDetails}>
          <Text style={styles.reminderTitle}>{item.medicineName}</Text>
          <Text style={styles.reminderDosage}>{item.medicineDosage}</Text>
        </View>
        <View style={[styles.statusBadge, statusStyle]}>
          <Text style={styles.statusText}>{statusText}</Text>
        </View>
      </TouchableOpacity>
    );
  };
  
  const renderGroupHeader = (title: string) => (
    <View style={styles.groupHeader}>
      <Text style={styles.groupTitle}>{title}</Text>
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#4a86e8" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.filterContainer}>
        {/* przyciski filtrów: Dzisiaj, Tydzień, Wszystkie */}
        <TouchableOpacity
          style={[styles.filterButton, filter === 'today' && styles.activeFilterButton]}
          onPress={() => setFilter('today')}
        >
          <Text style={[styles.filterText, filter === 'today' && styles.activeFilterText]}>Dzisiaj</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'week' && styles.activeFilterButton]}
          onPress={() => setFilter('week')}
        >
          <Text style={[styles.filterText, filter === 'week' && styles.activeFilterText]}>Tydzień</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'all' && styles.activeFilterButton]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterText, filter === 'all' && styles.activeFilterText]}>Wszystkie</Text>
        </TouchableOpacity>
      </View>
      
      {!loading && reminders.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="calendar-outline" size={80} color="#cccccc" />
          <Text style={styles.emptyText}>Brak przypomnień na ten okres</Text>
        </View>
      ) : (
        <FlatList
          data={groupedReminders}
          keyExtractor={(item) => item.date}
          renderItem={({ item }) => (
            <View>
              {renderGroupHeader(item.title)}
              <FlatList
                data={item.data}
                keyExtractor={(reminder) => reminder.id}
                renderItem={renderReminderItem}
                scrollEnabled={false}
              />
            </View>
          )}
          contentContainerStyle={styles.list}
          onRefresh={loadReminders}
          refreshing={loading}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  filterButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  activeFilterButton: {
    backgroundColor: '#4a86e8',
  },
  filterText: {
    fontSize: 14,
    color: '#555',
  },
  activeFilterText: {
    color: 'white',
    fontWeight: 'bold',
  },
  list: {
    paddingBottom: 20,
  },
  groupHeader: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  groupTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  reminderItem: {
    flexDirection: 'row',
    backgroundColor: 'white',
    padding: 16,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
  },
  reminderTime: {
    width: 60,
    marginRight: 12,
    alignItems: 'center',
  },
  timeText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4a86e8',
  },
  dateText: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  reminderDetails: {
    flex: 1,
  },
  reminderTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  reminderDosage: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  statusBadge: {
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    justifyContent: 'center',
  },
  statusPlanned: {
    backgroundColor: '#FFC107',
  },
  statusTaken: {
    backgroundColor: '#4CAF50',
  },
  statusSkipped: {
    backgroundColor: '#F44336',
  },
  statusText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 12,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 16,
    color: '#888',
    marginTop: 16,
    textAlign: 'center',
  },
});

export default RemindersScreen;
