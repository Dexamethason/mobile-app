import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { cancelMedicineNotification } from '../utils/notifications';
import { removeMedicineFromHistory, completelyRemoveMedicine, removeFromHistory } from '../utils/historyService';

interface Medicine {
  id: string;
  name: string;
  dosage: string;
  isRegular: boolean;
  times: string[];
  selectedDays: boolean[];
  oneTimeDate: string;
  oneTimeTime: string;
  notes: string;
  history: Array<{
    date: string;
    status: 'taken' | 'skipped';
  }>;
}

interface RouteParams {
  medicineId: string;
}

interface Props {
  route: { params: RouteParams };
  navigation: any;
}

const MedicineDetailsScreen: React.FC<Props> = ({ route, navigation }) => {
  const { medicineId } = route.params;
  const [medicine, setMedicine] = useState<Medicine | null>(null);
  const [loading, setLoading] = useState(true);
  
  // ładuj szczegóły leku z parametrem do wymuszonego odświeżenia
  useEffect(() => {
    loadMedicine();
  }, [medicineId]);

  // dodatkowy efekt na obsługę parametrów nawigacji
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      // sprawdź czy trzeba odświeżyć jak wracamy na ten ekran
      if (route.params?.refresh) {
        loadMedicine();
        // wyczyść flagę odświeżania
        navigation.setParams({ refresh: undefined });
      }
    });

    return unsubscribe;
  }, [navigation, route.params?.refresh]);

  // ładowanie leku z pamięci
  const loadMedicine = async () => {
    try {
      setLoading(true);
      const storedMedicines = await AsyncStorage.getItem('medicines');
      if (storedMedicines) {
        const medicines = JSON.parse(storedMedicines);
        const med = medicines.find((m: Medicine) => m.id === medicineId);
        if (med) {
          // Upewnij się, że historia istnieje
          if (!med.history) {
            med.history = [];
          }
          setMedicine(med);
        } else {
          Alert.alert('Błąd', 'Nie znaleziono leku');
          navigation.goBack();
        }
      }
    } catch (error) {
      console.error('Error loading medicine:', error);
      Alert.alert('Błąd', 'Nie udało się wczytać danych leku.');
    } finally {
      setLoading(false);
    }
  };

  // dodaj efekt do sprawdzania aktualizacji zamiast callbacka
  useEffect(() => {
    const checkMedicineUpdates = async () => {
      try {
        const updateJson = await AsyncStorage.getItem('lastUpdatedMedicine');
        if (updateJson) {
          const update = JSON.parse(updateJson);
          
          // sprawdź czy ta aktualizacja dotyczy obecnego leku i jest nowa (ostatnie 2 sekundy)
          if (update.id === medicineId && Date.now() - update.timestamp < 2000) {
            console.log(`Medicine ${medicineId} was recently updated, reloading...`);
            await AsyncStorage.removeItem('lastUpdatedMedicine');
            loadMedicine();
          }
        }
      } catch (error) {
        console.error('Error checking medicine updates:', error);
      }
    };
    
    // sprawdzaj okresowo aktualizacje
    const interval = setInterval(checkMedicineUpdates, 1000);
    checkMedicineUpdates(); // sprawdź od razu
    
    return () => clearInterval(interval);
  }, [medicineId]);

  // obsługa aktualizacji leku
  const handleMedicineUpdate = (updatedMedicine: Medicine) => {
    console.log("Medicine updated in details screen:", updatedMedicine);
    setMedicine(updatedMedicine);
    updateMedicineInStorage(updatedMedicine);
  };

  // zapisz lek w AsyncStorage
  const updateMedicineInStorage = async (updatedMedicine: Medicine) => {
    try {
      const storedMedicines = await AsyncStorage.getItem('medicines');
      if (storedMedicines) {
        const medicines = JSON.parse(storedMedicines);
        const updatedMedicines = medicines.map((med: Medicine) => 
          med.id === updatedMedicine.id ? updatedMedicine : med
        );
        await AsyncStorage.setItem('medicines', JSON.stringify(updatedMedicines));
      }
    } catch (error) {
      console.error('Error updating medicine:', error);
      Alert.alert('Błąd', 'Nie udało się zaktualizować danych leku.');
    }
  };

  // lepsza funkcja usuwania leku która usuwa tylko planowane wpisy
  const handleDelete = async () => {
    Alert.alert(
      'Usuń lek',
      'Czy na pewno chcesz usunąć ten lek? Wszystkie zaplanowane dawki zostaną usunięte.',
      [
        { text: 'Anuluj', style: 'cancel' },
        { 
          text: 'Usuń', 
          onPress: async () => {
            try {
              // pokaż wskaźnik ładowania
              setLoading(true);
              
              console.log(`Starting deletion of medicine: ${medicineId}`);
              
              // anuluj zaplanowane powiadomienia
              await cancelMedicineNotification(medicineId);
              
              // usuń planowane wpisy z historii (zachowaj przeszłą historię)
              await removeFromHistory(medicineId, true);
              
              // usuń z listy leków w pamięci
              const storedMedicinesJson = await AsyncStorage.getItem('medicines');
              if (storedMedicinesJson) {
                const storedMedicines = JSON.parse(storedMedicinesJson);
                const updatedMedicines = storedMedicines.filter(med => med.id !== medicineId);
                await AsyncStorage.setItem('medicines', JSON.stringify(updatedMedicines));
              }
              
              // zapisz powiadomienie o usunięciu dla innych ekranów
              await AsyncStorage.setItem('lastDeletedMedicine', JSON.stringify({
                id: medicineId,
                timestamp: Date.now(),
                onlyPlanned: true
              }));
              
              console.log(`Medicine ${medicineId} successfully deleted`);
              
              // wróć na poprzedni ekran z flagą do odświeżenia
              navigation.navigate('Medicines', { refresh: true });
            } catch (error) {
              console.error('Error deleting medicine:', error);
              Alert.alert('Błąd', 'Nie udało się usunąć leku.');
              setLoading(false);
            }
          },
          style: 'destructive'
        },
      ]
    );
  };

  // formatowanie wyświetlania daty
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pl-PL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // pokaż placeholdery podczas ładowania
  if (loading || !medicine) {
    return (
      <View style={[styles.container, styles.centerContainer]}>
        <Text>Ładowanie...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.medicineName}>{medicine.name}</Text>
        <Text style={styles.medicineDosage}>{medicine.dosage}</Text>
        <Text style={styles.medicineSchedule}>
          {medicine.isRegular ? 'Regularne dawkowanie' : 'Dawkowanie jednorazowe'}
        </Text>
      </View>
      
      {medicine.isRegular ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Harmonogram dawkowania</Text>
          <View style={styles.scheduleContainer}>
            <View style={styles.daysRow}>
              {['Nd', 'Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob'].map((day, index) => (
                <View key={index} style={[
                  styles.dayPill,
                  medicine.selectedDays[index] ? styles.activeDayPill : styles.inactiveDayPill
                ]}>
                  <Text style={[
                    styles.dayText,
                    medicine.selectedDays[index] ? styles.activeDayText : styles.inactiveDayText
                  ]}>
                    {day}
                  </Text>
                </View>
              ))}
            </View>
            
            <View style={styles.timesList}>
              {medicine.times.map((time, index) => (
                <View key={index} style={styles.timeItem}>
                  <Ionicons name="time-outline" size={20} color="#4a86e8" />
                  <Text style={styles.timeText}>{time}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Termin dawkowania</Text>
          <View style={styles.scheduleContainer}>
            <Text style={styles.timeText}>{formatDate(medicine.oneTimeDate)}</Text>
            <Text style={styles.timeText}>{medicine.oneTimeTime}</Text>
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Historia zażywania</Text>
        <View style={styles.historyList}>
          {medicine.history && medicine.history.length > 0 ? (
            medicine.history.map((item, index) => (
              <View key={index} style={styles.historyItem}>
                <Text style={styles.historyDate}>{formatDate(item.date)}</Text>
                <View style={[styles.statusIndicator, 
                  { backgroundColor: item.status === 'taken' ? '#4CAF50' : '#F44336' }]}>
                  <Text style={styles.statusText}>
                    {item.status === 'taken' ? 'Zażyty' : 'Pominięty'}
                  </Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.emptyHistoryText}>Brak historii zażywania</Text>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notatki</Text>
        <Text style={styles.notes}>{medicine.notes}</Text>
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity 
          style={[styles.button, styles.editButton]}
          onPress={() => navigation.navigate('AddEditMedicine', { 
            medicine, 
            refresh: true  // dodaj flagę odświeżania
          })}
        >
          <Ionicons name="create-outline" size={20} color="white" />
          <Text style={styles.buttonText}>Edytuj</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.button, styles.deleteButton]}
          onPress={handleDelete}
        >
          <Ionicons name="trash-outline" size={20} color="white" />
          <Text style={styles.buttonText}>Usuń</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    backgroundColor: 'white',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  medicineName: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  medicineDosage: {
    fontSize: 16,
    color: '#555',
    marginTop: 4,
  },
  medicineSchedule: {
    fontSize: 16,
    color: '#555',
    marginTop: 4,
  },
  section: {
    backgroundColor: 'white',
    marginTop: 16,
    padding: 20,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e0e0e0',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  scheduleContainer: {
    marginTop: 8,
  },
  daysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  dayPill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  activeDayPill: {
    backgroundColor: '#4a86e8',
  },
  inactiveDayPill: {
    backgroundColor: '#e0e0e0',
  },
  dayText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  activeDayText: {
    color: 'white',
  },
  inactiveDayText: {
    color: '#555',
  },
  timesList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  timeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e3f2fd',
    padding: 8,
    borderRadius: 4,
    marginRight: 10,
    marginBottom: 10,
  },
  timeText: {
    marginLeft: 6,
    fontSize: 16,
  },
  historyList: {
    marginTop: 8,
  },
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  historyDate: {
    fontSize: 16,
  },
  statusIndicator: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  statusText: {
    color: 'white',
    fontWeight: 'bold',
  },
  notes: {
    fontSize: 16,
    lineHeight: 22,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    flex: 1,
    marginHorizontal: 8,
  },
  editButton: {
    backgroundColor: '#4a86e8',
  },
  deleteButton: {
    backgroundColor: '#f44336',
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
    marginLeft: 6,
  },
  emptyHistoryText: {
    fontSize: 16,
    color: '#555',
    textAlign: 'center',
  },
});

export default MedicineDetailsScreen;
