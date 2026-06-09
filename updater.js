// Cleanly transforms UTC timestamps into a short, space-saving format with the day of the week
function formatToAEST(utcString) {
  const date = new Date(utcString);
  
  // Formats date to 'Day DD/MM' (e.g., 'Thu 11/06')
  const datePart = date.toLocaleDateString('en-AU', {
    timeZone: 'Australia/Sydney',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit'
  });

  // Formats time to 'h:mm am/pm'
  const timePart = date.toLocaleTimeString('en-AU', {
    timeZone: 'Australia/Sydney',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).toLowerCase();

  // Combines them smoothly into 'Thu 11/06 • 2:00 am'
  return `${datePart} • ${timePart}`;
}
