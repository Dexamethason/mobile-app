import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { formatDate, formatDateString, isDateInFuture, getDayName } from '../utils/dateUtils';
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
}

interface GroupedReminders {
  title: string; // "Today", "Tomorrow", "Next week", etc.
  date: string; // ISO date string
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

      // generujemy przypomnienia na 7 dni
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const nextWeek = new Date(today);
      nextWeek.setDate(nextWeek.getDate() + 7);

      const generatedReminders: Reminder[] = [];
      
      for (const medicine of medicines) {
        if (medicine.isRegular) {
          // obsługa regularnych leków - 7 dni
          for (let i = 0; i < 7; i++) {
            const date = new Date(today);
            date.setDate(date.getDate() + i);
            
            // sprawdź czy ten dzień jest wybrany
            const dayOfWeek = date.getDay(); 
            if (!medicine.selectedDays || !medicine.selectedDays[dayOfWeek]) {
              continue;
            }
            
            // sprawdzamy czy są czasy przypomnień
            if (medicine.times && medicine.times.length > 0) {
              for (const time of medicine.times) {
                const [hours, minutes] = time.split(':');
                const reminderTime = new Date(date);
                reminderTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
                
                // nie pokazujemy starych
                if (reminderTime < new Date()) {
                  continue;
                }
                
                // formatujemy string z datą do porównania z historią
                const dateString = reminderTime.toISOString().split('T')[0];
                
                // sprawdzamy status
                let status: 'planned' | 'taken' | 'skipped' = 'planned';
                if (history && history[dateString]) {
                  // szukamy pasującego wpisu w historii
                  const historyRecord = history[dateString].find(record => 
                    record.id.startsWith(`${medicine.id}_`) && record.time === time
                  );
                  
                  if (historyRecord) {
                    status = historyRecord.status as 'planned' | 'taken' | 'skipped';
                  }
                }
                
                // tworzymy przypomnienie
                generatedReminders.push({
                  id: `${medicine.id}_${dateString}_${time}`,
                  medicineId: medicine.id,
                  medicineName: medicine.name,
                  medicineDosage: medicine.dosage,
                  date: dateString,
                  time,
                  status,
                  timestamp: reminderTime.toISOString()
                });
              }
            }
          }
        } else {
          // obsługa jednorazowych leków
          if (medicine.oneTimeDate) {
            const medicineDate = new Date(medicine.oneTimeDate);
            medicineDate.setHours(0, 0, 0, 0);
            
            // tylko jak dzisiaj albo w przyszłości i max 7 dni
            if (medicineDate >= today && medicineDate <= nextWeek) {
              const dateString = medicine.oneTimeDate.split('T')[0];
              
              // sprawdzamy status w historii
              let status: 'planned' | 'taken' | 'skipped' = 'planned';
              if (history && history[dateString]) {
                // szukamy pasującego wpisu
                const historyRecord = history[dateString].find(record => 
                  record.id.startsWith(`${medicine.id}_`)
                );
                
                if (historyRecord) {
                  status = historyRecord.status as 'planned' | 'taken' | 'skipped';
                }
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
                timestamp: new Date(medicine.oneTimeDate).toISOString()
              });
            }
          }
        }
      }
      
      // sort po dacie i czasie
      generatedReminders.sort((a, b) => {
        return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      });
      
      setReminders(generatedReminders);
      console.log(`Loaded ${generatedReminders.length} reminders`);
      
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
    
    // filtrujemy przypomnienia na podstawie aktualnego filtra
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);
    
    let filteredReminders = [...reminders];
    
    if (filter === 'today') {
      const todayString = today.toISOString().split('T')[0];
      filteredReminders = reminders.filter(r => r.date === todayString);
    } else if (filter === 'week') {
      filteredReminders = reminders.filter(r => {
        const reminderDate = new Date(r.date);
        return reminderDate >= today && reminderDate <= nextWeek;
      });
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
    const todayString = today.toISOString().split('T')[0];
    const tomorrowString = new Date(today.getTime() + 86400000).toISOString().split('T')[0];
    
    const groupArray: GroupedReminders[] = Object.keys(groups).map(date => {
      let title = '';
      if (date === todayString) {
        title = 'Dzisiaj';
      } else if (date === tomorrowString) {
        title = 'Jutro';
      } else {
        const dateObj = new Date(date);
        const dayName = getDayName(dateObj);
        title = `${dayName}, ${formatDateString(date)}`;
      }
      
      return {
        title,
        date,
        data: groups[date]
      };
    });
    
    // sortujemy po dacie
    groupArray.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
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
