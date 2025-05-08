import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Alert } from 'react-native';
import { Calendar } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { recordMedicineDose, getHistoryForDate, migrateLegacyHistory } from '../utils/historyService';
import { formatDateString, getDateString, isDateTimeInFuture } from '../utils/dateUtils';

interface MedicineRecord {
  id: string;
  name: string;
  dosage: string;
  time: string;
  status: 'taken' | 'skipped' | 'planned';
  timestamp: string;
}

interface DayHistory {
  marked: boolean;
  dotColor: string;
  medicines: MedicineRecord[];
}

interface MedicineHistoryState {
  [date: string]: DayHistory;
}

interface Props {
  navigation: {
    addListener: (event: string, callback: () => void) => () => void;
  };
}

const HistoryScreen: React.FC<Props> = ({ navigation }) => {
  const [medicineHistory, setMedicineHistory] = useState<MedicineHistoryState>({});
  const [selectedDate, setSelectedDate] = useState(getDateString(new Date()));
  const [viewMode, setViewMode] = useState('month'); // 'month', 'week', or 'day'
  const [loading, setLoading] = useState(true);

  // Load history from storage
  useEffect(() => {
    loadHistory();
  }, []);

  // Enhanced reload history when screen is focused
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      console.log("HistoryScreen focused - reloading history");
      loadHistory();
    });

    return unsubscribe;
  }, [navigation]);

  // Check for legacy data format and migrate if needed
  useEffect(() => {
    const checkAndMigrateHistory = async () => {
      const migrated = await migrateLegacyHistory();
      if (migrated) {
        console.log('Legacy history data was migrated, reloading...');
        loadHistory();
      }
    };
    
    checkAndMigrateHistory();
  }, []);

  // Add deletion check with improved detection of deletion type
  useEffect(() => {
    // Check for medicine deletions
    const checkForDeletions = async () => {
      try {
        const deletionJson = await AsyncStorage.getItem('lastDeletedMedicine');
        if (deletionJson) {
          const deletion = JSON.parse(deletionJson);
          // Check if this deletion is recent (within the last 10 seconds)
          const isRecent = Date.now() - deletion.timestamp < 10000;
          
          if (isRecent) {
            console.log(`Recent deletion detected for medicine ${deletion.id}, refreshing history`);
            loadHistory();
            // Clear the deletion flag to prevent duplicate processing
            await AsyncStorage.removeItem('lastDeletedMedicine');
          }
        }
      } catch (error) {
        console.error('Error checking for medicine deletions:', error);
      }
    };
    
    // Set up a timer to check for deletions
    const timer = setInterval(checkForDeletions, 1000); // Check more frequently
    
    // Initial check
    checkForDeletions();
    
    return () => clearInterval(timer);
  }, []);

  // Make loadHistory more robust
  const loadHistory = useCallback(async () => {
    try {
      setLoading(true);
      
      // Load history data directly from storage
      const historyJson = await AsyncStorage.getItem('medicineHistory');
      let formattedHistory: MedicineHistoryState = {};
      
      if (historyJson) {
        const history = JSON.parse(historyJson) as Record<string, MedicineRecord[]>;
        
        // Format history for calendar marking and ensure no empty entries
        Object.entries(history).forEach(([date, medicines]) => {
          // Skip dates with no medicines
          if (!medicines || !Array.isArray(medicines) || medicines.length === 0) {
            return;
          }
          
          // Sort medicines by time
          const sortedMedicines = [...medicines].sort((a, b) => {
            return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
          });
          
          // Process statuses
          const allTaken = sortedMedicines.every(med => med.status === 'taken');
          const anyTaken = sortedMedicines.some(med => med.status === 'taken');
          const allSkipped = sortedMedicines.every(med => med.status === 'skipped');
          
          // Determine the dot color based on medicine statuses
          let dotColor;
          if (allTaken) {
            dotColor = '#4CAF50'; // Green for all taken
          } else if (anyTaken) {
            dotColor = '#FFC107'; // Yellow for some taken
          } else if (allSkipped) {
            dotColor = '#F44336'; // Red for all skipped
          } else {
            dotColor = '#FFC107'; // Yellow for planned
          }

          formattedHistory[date] = {
            marked: true,
            dotColor: dotColor,
            medicines: sortedMedicines
          };
        });
      }
      
      // Update state with new history data
      setMedicineHistory(formattedHistory);
      console.log('History data reloaded successfully');
    } catch (error) {
      console.error('Error loading history:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Add a manual refresh button
  const forceRefresh = () => {
    loadHistory();
  };

  // Selected day's medicine history
  const selectedDayMedicines = selectedDate && medicineHistory[selectedDate] ? 
    medicineHistory[selectedDate].medicines : [];

  const handleDayPress = (day: { dateString: string }) => {
    setSelectedDate(day.dateString);
  };

  const isDateInFuture = (date: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);
    return checkDate > today;
  };

  const isMedicineInFuture = (timestamp: string) => {
    const now = new Date();
    const medicineTime = new Date(timestamp);
    return medicineTime > now;
  };

  const showStatusChangeDialog = (medicine: MedicineRecord) => {
    if (isDateInFuture(selectedDate)) {
      Alert.alert('Informacja', 'Nie można zmienić statusu dla zaplanowanych leków.');
      return;
    }
    
    Alert.alert(
      'Oznacz status leku',
      `${medicine.name}, ${medicine.dosage}`,
      [
        {
          text: 'Anuluj',
          style: 'cancel'
        },
        {
          text: 'Zażyty',
          onPress: () => changeMedicineStatus(medicine, 'taken')
        },
        {
          text: 'Pominięty',
          onPress: () => changeMedicineStatus(medicine, 'skipped')
        }
      ]
    );
  };

  const changeMedicineStatus = async (medicine: MedicineRecord, newStatus: 'taken' | 'skipped' | 'planned') => {
    try {
      const date = new Date(medicine.timestamp);
      const medicineCopy = { ...medicine, id: medicine.id.split('_')[0] };
      await recordMedicineDose(medicineCopy, newStatus, date);
      await loadHistory();
    } catch (error) {
      console.error('Błąd podczas aktualizacji statusu leku:', error);
    }
  };

  // Add debug button
  const debugHistoryData = async () => {
    try {
      const historyJson = await AsyncStorage.getItem('medicineHistory');
      console.log('=== HISTORY DEBUG ===');
      if (historyJson) {
        const history = JSON.parse(historyJson);
        console.log(`Total dates in history: ${Object.keys(history).length}`);
        Object.keys(history).forEach(date => {
          console.log(`Date: ${date}`);
          if (history[date] && Array.isArray(history[date])) {
            history[date].forEach((med: MedicineRecord, i: number) => {
              console.log(`  #${i+1} ${med.name} - ${med.time} - status: ${med.status}`);
              console.log(`     timestamp: ${med.timestamp}`);
              
              // Check if this medicine is in the future
              const medTime = new Date(med.timestamp);
              const now = new Date();
              console.log(`     isFuture: ${medTime > now}`);
            });
          } else if (history[date] && history[date].medicines) {
            // Handle processed history format
            history[date].medicines.forEach((med: MedicineRecord, i: number) => {
              console.log(`  #${i+1} ${med.name} - ${med.time} - status: ${med.status}`);
            });
          }
        });
      } else {
        console.log('No history data found');
      }
      console.log('====================');
      Alert.alert('Debug', 'History data logged to console');
    } catch (error) {
      console.error('Debug error:', error);
    }
  };

  // Updated rendering to handle the three status values
  const renderMedicineItem = ({ item }: { item: MedicineRecord }) => {
    // Parse dates for comparison
    const isFuture = isDateTimeInFuture(item.timestamp);
    
    // Log the status for debugging
    console.log(`Rendering medicine: ${item.name}, time: ${item.time}, status: ${item.status}, isFuture: ${isFuture}, timestamp: ${item.timestamp}`);
    
    // Determine display status and style
    let statusStyle, statusText;
    
    if (isFuture) {
      statusStyle = styles.plannedButton;
      statusText = 'Zaplanowany';
    } else {
      // For past medicines, use the assigned status for display, but default to "Pominięty" if still marked as "planned"
      switch(item.status) {
        case 'taken':
          statusStyle = styles.takenButton;
          statusText = 'Zażyty';
          break;
        case 'planned': // For past dates that are still marked as "planned", show as "Pominięty" instead
          statusStyle = styles.notTakenButton;
          statusText = 'Pominięty';
          break;
        case 'skipped':
        default:
          statusStyle = styles.notTakenButton;
          statusText = 'Pominięty';
          break;
      }
    }

    return (
      <View style={styles.medicineItem}>
        <View style={styles.medicineInfo}>
          <Text style={styles.medicineName}>{item.name}</Text>
          <Text style={styles.medicineDosage}>{item.dosage} - {item.time}</Text>
        </View>
        <TouchableOpacity 
          style={[styles.statusButton, statusStyle]}
          onPress={() => !isFuture && showStatusChangeDialog(item)}
          disabled={isFuture}
        >
          <Text style={styles.statusButtonText}>
            {statusText}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContainer]}>
        <Text>Ładowanie...</Text>
      </View>
    );
  }

  // Update the return to include a debug button
  return (
    <View style={styles.container}>
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterButton, viewMode === 'month' && styles.activeFilterButton]}
          onPress={() => setViewMode('month')}
        >
          <Text style={[styles.filterText, viewMode === 'month' && styles.activeFilterText]}>
            Miesiąc
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, viewMode === 'week' && styles.activeFilterButton]}
          onPress={() => setViewMode('week')}
        >
          <Text style={[styles.filterText, viewMode === 'week' && styles.activeFilterText]}>
            Tydzień
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, viewMode === 'day' && styles.activeFilterButton]}
          onPress={() => setViewMode('day')}
        >
          <Text style={[styles.filterText, viewMode === 'day' && styles.activeFilterText]}>
            Dzień
          </Text>
        </TouchableOpacity>
      </View>

      <Calendar
        markedDates={{
          ...medicineHistory,
          [selectedDate]: {
            ...(medicineHistory[selectedDate] || {}),
            selected: true,
            selectedColor: '#4a86e8'
          }
        }}
        onDayPress={handleDayPress}
      />
      
      <View style={styles.historyContainer}>
        <View style={styles.headerRow}>
          <Text style={styles.historyTitle}>
            Historia {formatDateString(selectedDate)}
          </Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity onPress={forceRefresh} style={styles.refreshButton}>
              <Ionicons name="refresh" size={16} color="white" />
            </TouchableOpacity>
            <TouchableOpacity onPress={debugHistoryData} style={styles.debugButton}>
              <Text style={styles.debugText}>Debug</Text>
            </TouchableOpacity>
          </View>
        </View>
        
        {selectedDayMedicines.length > 0 ? (
          <FlatList
            data={selectedDayMedicines}
            renderItem={renderMedicineItem}
            keyExtractor={item => item.id}
          />
        ) : (
          <Text style={styles.emptyHistoryText}>
            Brak zapisanej historii dla tego dnia
          </Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
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
  historyContainer: {
    flex: 1,
    padding: 16,
  },
  historyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  medicineItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
  },
  medicineInfo: {
    flex: 1,
  },
  medicineName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  medicineDosage: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  statusButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  takenButton: {
    backgroundColor: '#4CAF50',
  },
  notTakenButton: {
    backgroundColor: '#F44336',
  },
  plannedButton: {
    backgroundColor: '#FFC107',
  },
  statusButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  emptyHistoryText: {
    textAlign: 'center',
    fontSize: 16,
    color: '#666',
    marginTop: 20,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonRow: {
    flexDirection: 'row',
  },
  refreshButton: {
    backgroundColor: '#4a86e8',
    padding: 6,
    borderRadius: 4,
    marginRight: 6,
  },
  debugButton: {
    backgroundColor: '#999',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  debugText: {
    color: 'white',
    fontSize: 12,
  },
});

export default HistoryScreen;
