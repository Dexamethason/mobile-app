import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TextInput, 
  TouchableOpacity, 
  ScrollView, 
  Switch,
  Modal,
  Alert,
  Pressable
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { updateMedicineNotification } from '../utils/notifications';
import { recordMedicineDose, updateMedicineReferencesInHistory, removeFromHistory } from '../utils/historyService';

const AddEditMedicineScreen = ({ route, navigation }) => {
  const editingMedicine = route.params?.medicine;
  const isEditing = !!editingMedicine;

  // podstawowe info o leku
  const [name, setName] = useState(isEditing ? editingMedicine.name : '');
  const [dosage, setDosage] = useState(isEditing ? editingMedicine.dosage : '');
  const [quantity, setQuantity] = useState(isEditing ? editingMedicine.quantity?.toString() || '30' : '');
  const [notes, setNotes] = useState(isEditing ? editingMedicine.notes : '');
  
  // Typ harmonogramu
  const [isRegular, setIsRegular] = useState(isEditing ? editingMedicine.isRegular !== false : true);
  
  // dla regularnego harmonogramu
  const [times, setTimes] = useState(isEditing && editingMedicine.times ? 
    editingMedicine.times.map(time => ({ time, enabled: true })) : 
    [{ time: '08:00', enabled: true }]
  );
  
  // dni tygodnia dla reg leków (domyślnie wszystkie dni)
  const [selectedDays, setSelectedDays] = useState(isEditing && editingMedicine.selectedDays ? 
    editingMedicine.selectedDays : 
    [true, true, true, true, true, true, true]
  );
  
  // d1razowe dawkowanie
  const [oneTimeDate, setOneTimeDate] = useState(isEditing && editingMedicine.oneTimeDate ? 
    new Date(editingMedicine.oneTimeDate) : 
    new Date()
  );
  const [oneTimeTime, setOneTimeTime] = useState(isEditing && editingMedicine.oneTimeTime ? 
    editingMedicine.oneTimeTime : 
    '08:00'
  );

  const [showTimePickerModal, setShowTimePickerModal] = useState(false);
  const [currentTimeIndex, setCurrentTimeIndex] = useState(0);
  const [tempHours, setTempHours] = useState('08');
  const [tempMinutes, setTempMinutes] = useState('00');
  const [isOneTimePicker, setIsOneTimePicker] = useState(false);
  
  const [showDatePickerModal, setShowDatePickerModal] = useState(false);
  const [tempDate, setTempDate] = useState(oneTimeDate);

  // opcje godzin
  const hourOptions = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
  // opcje minut
  const minuteOptions = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'));
  
  // nazwy dni
  const dayNames = ['Nd', 'Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob'];

  // dodawanie czasu
  const handleAddTime = () => {
    setTimes([...times, { time: '12:00', enabled: true }]);
  };

  // usuwanie czasu
  const handleRemoveTime = (index) => {
    const newTimes = [...times];
    newTimes.splice(index, 1);
    setTimes(newTimes);
  };

  // pokazanie modala z wyborem godziny
  const showTimePickerForIndex = (index, isOneTime = false) => {
    if (isOneTime) {
      const [hours, minutes] = oneTimeTime.split(':');
      setTempHours(hours);
      setTempMinutes(minutes);
      setIsOneTimePicker(true);
    } else {
      const [hours, minutes] = times[index].time.split(':');
      setTempHours(hours);
      setTempMinutes(minutes);
      setCurrentTimeIndex(index);
      setIsOneTimePicker(false);
    }
    setShowTimePickerModal(true);
  };

  const handleTimeConfirm = () => {
    const timeString = `${tempHours}:${tempMinutes}`;
    
    if (isOneTimePicker) {
      setOneTimeTime(timeString);
    } else {
      const newTimes = [...times];
      newTimes[currentTimeIndex] = { ...newTimes[currentTimeIndex], time: timeString };
      setTimes(newTimes);
    }
    setShowTimePickerModal(false);
  };

  const toggleTimeEnabled = (index) => {
    const newTimes = [...times];
    newTimes[index] = { ...newTimes[index], enabled: !newTimes[index].enabled };
    setTimes(newTimes);
  };

  const toggleDay = (index) => {
    const newSelectedDays = [...selectedDays];
    newSelectedDays[index] = !newSelectedDays[index];
    setSelectedDays(newSelectedDays);
  };

  const handleDatePick = () => {
    setTempDate(oneTimeDate);
    setShowDatePickerModal(true);
  };

  const handleDateConfirm = () => {
    setOneTimeDate(tempDate);
    setShowDatePickerModal(false);
  };

  const addDay = () => {
    const nextDay = new Date(tempDate);
    nextDay.setDate(nextDay.getDate() + 1);
    setTempDate(nextDay);
  };

  const subtractDay = () => {
    const prevDay = new Date(tempDate);
    prevDay.setDate(prevDay.getDate() - 1);
    setTempDate(prevDay);
  };

  const formatDate = (date) => {
    return date.toLocaleDateString('pl-PL', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Błąd', 'Proszę podać nazwę leku');
      return;
    }
    
    if (!dosage.trim()) {
      Alert.alert('Błąd', 'Proszę podać dawkę leku');
      return;
    }

    // string z opisem dawkowania
    const schedule = isRegular ? 
      `${times.filter(t => t.enabled).length}x dziennie` : 
      `Jednorazowo: ${formatDate(oneTimeDate)}`;

    // obiekt z danymi leku
    const medicineData = {
      id: isEditing ? editingMedicine.id : Date.now().toString(),
      name,
      dosage,
      quantity: quantity ? parseInt(quantity) : 0,
      notes,
      isRegular,
      times: times.filter(t => t.enabled).map(t => t.time),  // bierzemy tylko włączone czasy!!
      selectedDays,
      oneTimeDate: oneTimeDate.toISOString(),
      oneTimeTime,
      schedule
    };
    
    try {
      console.log('Saving medicine data:', medicineData);
      
      // aktualizujemy powiadomienie
      await updateMedicineNotification(medicineData);
      

      let scheduleChanged = false;
      
      if (isEditing) {
        // check czy sie zminił
        if (editingMedicine.isRegular !== isRegular) {
          // zmienił się typ harmonogramu
          scheduleChanged = true;
        } else if (isRegular) {
          // lek regularny - sprawdź czy czas sie zmienił
          const oldTimes = new Set(editingMedicine.times || []);
          const newTimes = new Set(medicineData.times);
          
          if (oldTimes.size !== newTimes.size) {
            scheduleChanged = true;
          } else {
            // sprawdź czy któryś czas się zmienił
            for (const time of oldTimes) {
              if (!newTimes.has(time)) {
                scheduleChanged = true;
                break;
              }
            }
          }
        } else {
          if (editingMedicine.oneTimeTime !== oneTimeTime || 
              new Date(editingMedicine.oneTimeDate).toDateString() !== oneTimeDate.toDateString()) {
            scheduleChanged = true;
          }
        }
      }
      
      if (!isEditing) {
        if (isRegular) {
          await recordMedicineDose(medicineData, 'planned', new Date());
        } else {
          const selectedDate = new Date(oneTimeDate);
          const [hours, minutes] = oneTimeTime.split(':');
          selectedDate.setHours(parseInt(hours), parseInt(minutes));
          await recordMedicineDose(medicineData, 'planned', selectedDate);
        }
      } else {
        // przy edycji, aktualizuj historie
        console.log('Updating medicine references in history:', medicineData.id);
        
        if (scheduleChanged) {
          console.log('Schedule changed significantly, recreating history entries');
          
          // usun stare wpisy
          await removeFromHistory(medicineData.id, true);
          
          // dodajemy nowe
          if (isRegular) {
            for (const time of medicineData.times) {
              const [hours, minutes] = time.split(':');
              const scheduleTime = new Date();
              scheduleTime.setHours(parseInt(hours), parseInt(minutes));
              await recordMedicineDose(medicineData, 'planned', scheduleTime);
            }
          } else {
            const selectedDate = new Date(oneTimeDate);
            const [hours, minutes] = oneTimeTime.split(':');
            selectedDate.setHours(parseInt(hours), parseInt(minutes));
            await recordMedicineDose(medicineData, 'planned', selectedDate);
          }
        } else {
          await updateMedicineReferencesInHistory(medicineData.id, medicineData);
        }
      }
      
      // Aktualizacja leku - AsyncStorage
      const storedMedicinesJson = await AsyncStorage.getItem('medicines');
      if (storedMedicinesJson) {
        const storedMedicines = JSON.parse(storedMedicinesJson);
        let updatedMedicines;
        
        if (isEditing) {
          // update istniejącego leku
          updatedMedicines = storedMedicines.map(med => 
            med.id === medicineData.id ? medicineData : med
          );
        } else {
          // dodawanie nowego leku
          updatedMedicines = [...storedMedicines, medicineData];
        }
        
        await AsyncStorage.setItem('medicines', JSON.stringify(updatedMedicines));
      } else if (!isEditing) {
        // pierwszy lek jaki dodajemy
        await AsyncStorage.setItem('medicines', JSON.stringify([medicineData]));
      }
      
      // aktualizacja ostatnio dodanego leku
      await AsyncStorage.setItem('lastUpdatedMedicine', JSON.stringify({
        id: medicineData.id,
        name: medicineData.name,
        timestamp: Date.now()
      }));
      
      navigation.navigate('Medicines', { refresh: true });
    } catch (error) {
      console.error('Error saving medicine:', error);
      Alert.alert('Błąd', 'Nie udało się zapisać leku i zaplanować powiadomienia.');
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.formGroup}>
        <Text style={styles.label}>Nazwa leku</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Np. Paracetamol"
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Dawka</Text>
        <TextInput
          style={styles.input}
          value={dosage}
          onChangeText={setDosage}
          placeholder="Np. 500mg"
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Ilość w opakowaniu</Text>
        <TextInput
          style={styles.input}
          value={quantity}
          onChangeText={setQuantity}
          placeholder="Np. 30 tabletek"
          keyboardType="numeric"
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Typ harmonogramu</Text>
        <View style={styles.scheduleTypeContainer}>
          <TouchableOpacity 
            style={[
              styles.scheduleTypeButton, 
              isRegular && styles.scheduleTypeActive
            ]}
            onPress={() => setIsRegular(true)}
          >
            <Ionicons name="repeat" size={20} color={isRegular ? "white" : "#4a86e8"} />
            <Text style={[
              styles.scheduleTypeText, 
              isRegular && styles.scheduleTypeTextActive
            ]}>
              Regularnie
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[
              styles.scheduleTypeButton, 
              !isRegular && styles.scheduleTypeActive
            ]}
            onPress={() => setIsRegular(false)}
          >
            <Ionicons name="calendar" size={20} color={!isRegular ? "white" : "#4a86e8"} />
            <Text style={[
              styles.scheduleTypeText, 
              !isRegular && styles.scheduleTypeTextActive
            ]}>
              Jednorazowo
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {isRegular ? (
        // UI dla regularnego harmonogramu
        <>
          <View style={styles.formGroup}>
            <Text style={styles.label}>Dni tygodnia</Text>
            <View style={styles.daysContainer}>
              {dayNames.map((day, index) => (
                <TouchableOpacity 
                  key={index}
                  style={[
                    styles.dayButton,
                    selectedDays[index] && styles.dayButtonSelected
                  ]}
                  onPress={() => toggleDay(index)}
                >
                  <Text style={[
                    styles.dayButtonText,
                    selectedDays[index] && styles.dayButtonTextSelected
                  ]}>
                    {day}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Godziny przyjmowania</Text>
            {times.map((timeObj, index) => (
              <View key={index} style={styles.timeRow}>
                <Switch
                  value={timeObj.enabled}
                  onValueChange={() => toggleTimeEnabled(index)}
                  trackColor={{ false: "#767577", true: "#4a86e8" }}
                />
                <TouchableOpacity 
                  style={[styles.timeInput, !timeObj.enabled && styles.timeInputDisabled]}
                  onPress={() => showTimePickerForIndex(index)}
                >
                  <Text style={styles.timeText}>{timeObj.time}</Text>
                  <Ionicons name="time-outline" size={20} color="#555" />
                </TouchableOpacity>
                {times.length > 1 && (
                  <TouchableOpacity 
                    style={styles.removeButton} 
                    onPress={() => handleRemoveTime(index)}
                  >
                    <Ionicons name="trash-outline" size={20} color="#f44336" />
                  </TouchableOpacity>
                )}
              </View>
            ))}
            
            <TouchableOpacity style={styles.addTimeButton} onPress={handleAddTime}>
              <Ionicons name="add-circle-outline" size={20} color="#4a86e8" />
              <Text style={styles.addTimeText}>Dodaj godzinę</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        // UI dla jednorazowego dawkowania
        <View style={styles.formGroup}>
          <Text style={styles.label}>Termin zażycia leku</Text>
          
          <TouchableOpacity 
            style={styles.dateInput}
            onPress={handleDatePick}
          >
            <Text style={styles.dateText}>{formatDate(oneTimeDate)}</Text>
            <Ionicons name="calendar-outline" size={20} color="#555" />
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.timeInput}
            onPress={() => showTimePickerForIndex(0, true)}
          >
            <Text style={styles.timeText}>{oneTimeTime}</Text>
            <Ionicons name="time-outline" size={20} color="#555" />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.formGroup}>
        <Text style={styles.label}>Notatki</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Dodatkowe informacje o leku..."
          multiline
          numberOfLines={4}
        />
      </View>

      <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
        <Text style={styles.saveButtonText}>Zapisz</Text>
      </TouchableOpacity>

      {/* Modal do wybierania czasu */}
      <Modal
        visible={showTimePickerModal}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Wybierz godzinę</Text>
            
            <View style={styles.timePickerContainer}>
              <View style={styles.pickerColumn}>
                <Text style={styles.pickerLabel}>Godzina</Text>
                <ScrollView style={styles.pickerScroll}>
                  {hourOptions.map(hour => (
                    <TouchableOpacity 
                      key={hour}
                      style={[
                        styles.pickerItem, 
                        hour === tempHours && styles.pickerItemSelected
                      ]}
                      onPress={() => setTempHours(hour)}
                    >
                      <Text style={[
                        styles.pickerItemText,
                        hour === tempHours && styles.pickerItemTextSelected
                      ]}>
                        {hour}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              
              <Text style={styles.timeSeparator}>:</Text>
              
              <View style={styles.pickerColumn}>
                <Text style={styles.pickerLabel}>Minuta</Text>
                <ScrollView style={styles.pickerScroll}>
                  {minuteOptions.map(minute => (
                    <TouchableOpacity 
                      key={minute}
                      style={[
                        styles.pickerItem, 
                        minute === tempMinutes && styles.pickerItemSelected
                      ]}
                      onPress={() => setTempMinutes(minute)}
                    >
                      <Text style={[
                        styles.pickerItemText,
                        minute === tempMinutes && styles.pickerItemTextSelected
                      ]}>
                        {minute}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
            
            <View style={styles.modalButtonsContainer}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowTimePickerModal(false)}
              >
                <Text style={styles.modalButtonText}>Anuluj</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, styles.confirmButton]}
                onPress={handleTimeConfirm}
              >
                <Text style={styles.modalButtonText}>Potwierdź</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* modal do wyboru daty */}
      <Modal
        visible={showDatePickerModal}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Wybierz datę</Text>
            
            <View style={styles.datePickerContainer}>
              <TouchableOpacity onPress={subtractDay}>
                <Ionicons name="chevron-back" size={30} color="#4a86e8" />
              </TouchableOpacity>
              
              <Text style={styles.dateDisplay}>{formatDate(tempDate)}</Text>
              
              <TouchableOpacity onPress={addDay}>
                <Ionicons name="chevron-forward" size={30} color="#4a86e8" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.modalButtonsContainer}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowDatePickerModal(false)}
              >
                <Text style={styles.modalButtonText}>Anuluj</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, styles.confirmButton]}
                onPress={handleDateConfirm}
              >
                <Text style={[styles.modalButtonText, {color: 'white'}]}>Potwierdź</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 16,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#333',
  },
  input: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  timeInput: {
    flex: 1,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginLeft: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timeInputDisabled: {
    backgroundColor: '#f0f0f0',
  },
  timeText: {
    fontSize: 16,
  },
  removeButton: {
    padding: 10,
    marginLeft: 10,
  },
  addTimeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
  },
  addTimeText: {
    color: '#4a86e8',
    fontSize: 16,
    marginLeft: 8,
  },
  saveButton: {
    backgroundColor: '#4a86e8',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginVertical: 20,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // style dla modali
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    width: '80%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  timePickerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  pickerColumn: {
    width: 80,
  },
  pickerLabel: {
    textAlign: 'center',
    marginBottom: 8,
    fontWeight: 'bold',
  },
  pickerScroll: {
    height: 150,
  },
  pickerItem: {
    padding: 10,
    alignItems: 'center',
  },
  pickerItemSelected: {
    backgroundColor: '#e6f0ff',
    borderRadius: 4,
  },
  pickerItemText: {
    fontSize: 18,
  },
  pickerItemTextSelected: {
    fontWeight: 'bold',
    color: '#4a86e8',
  },
  timeSeparator: {
    fontSize: 24,
    fontWeight: 'bold',
    marginHorizontal: 10,
  },
  modalButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
  },
  confirmButton: {
    backgroundColor: '#4a86e8',
  },
  modalButtonText: {
    fontWeight: 'bold',
    fontSize: 16,
    color: '#333',
  },
  scheduleTypeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  scheduleTypeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#4a86e8',
    borderRadius: 8,
    width: '48%',
  },
  scheduleTypeActive: {
    backgroundColor: '#4a86e8',
  },
  scheduleTypeText: {
    marginLeft: 8,
    fontWeight: 'bold',
    color: '#4a86e8',
  },
  scheduleTypeTextActive: {
    color: 'white',
  },
  daysContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  dayButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  dayButtonSelected: {
    backgroundColor: '#4a86e8',
  },
  dayButtonText: {
    fontWeight: 'bold',
  },
  dayButtonTextSelected: {
    color: 'white',
  },
  dateInput: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateText: {
    fontSize: 16,
  },
  datePickerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  dateDisplay: {
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default AddEditMedicineScreen;
