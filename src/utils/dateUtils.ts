const MONTHS_PL = [
  'stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca',
  'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'
];

const DAYS_PL = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'];
const SHORT_DAYS_PL = ['Nd', 'Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob'];

export const formatDate = (date: Date): string => {
  const day = date.getDate();
  const month = MONTHS_PL[date.getMonth()];
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
};

export const formatTime = (date: Date): string => {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
};

export const formatDateString = (dateString: string): string => {
  const date = new Date(dateString);
  return formatDate(date);
};

export const formatTimeString = (timeString: string): string => {
  const [hours, minutes] = timeString.split(':');
  const date = new Date();
  date.setHours(parseInt(hours, 10), parseInt(minutes, 10));
  return formatTime(date);
};

export const getDateString = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

export const getDayName = (date: Date, short: boolean = false): string => {
  return short ? SHORT_DAYS_PL[date.getDay()] : DAYS_PL[date.getDay()];
};

// Check if a date is in the future (comparing whole days)
export const isDateInFuture = (date: Date | string): boolean => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const checkDate = typeof date === 'string' ? new Date(date) : date;
  const normalizedDate = new Date(checkDate);
  normalizedDate.setHours(0, 0, 0, 0);
  
  return normalizedDate > today;
};

// Check if a specific datetime is in the future (comparing exact time)
export const isDateTimeInFuture = (dateTime: Date | string): boolean => {
  const now = new Date();
  const checkDateTime = typeof dateTime === 'string' ? new Date(dateTime) : dateTime;
  
  // Log to help debugging
  console.log(`Comparing dates - now: ${now.toISOString()}, check: ${checkDateTime.toISOString()}`);
  console.log(`Is future? ${checkDateTime > now}`);
  
  return checkDateTime > now;
};

// Debug logging for dates
export const debugDate = (date: Date | string, label: string = "Date"): void => {
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    console.log(`[DEBUG] ${label}: ${dateObj.toISOString()}`);
    console.log(`[DEBUG] Current time: ${new Date().toISOString()}`);
    console.log(`[DEBUG] Is future: ${dateObj > new Date()}`);
    
    // Also show normalized date comparison (just the day)
    const normalizedDate = new Date(dateObj);
    normalizedDate.setHours(0, 0, 0, 0);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    console.log(`[DEBUG] Is future day: ${normalizedDate > today}`);
  } catch (error) {
    console.error(`[DEBUG] Error processing date:`, error);
  }
};

// Parse time string into a Date object for today
export const parseTimeToDate = (timeString: string): Date => {
  const [hours, minutes] = timeString.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
};