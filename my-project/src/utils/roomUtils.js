/**
 * 학생의 학번을 바탕으로 배정 교실(Room)을 반환하는 유틸리티
 * @param {string|number} studentId - 학번 (예: 10401)
 * @returns {string} 배정 교실 (예: '1반실', '2반실', '3반실', '미배정')
 */
export const getRoom = (studentId) => {
  if (!studentId) return '미배정';
  
  const str = String(studentId).trim();
  let cls = 0;
  
  if (str.length === 5) {
    // 5자리 학번 예: 10401 -> 2,3번째 자리 '04'가 반
    cls = parseInt(str.substring(1, 3), 10);
  } else if (str.length === 4) {
    // 과거 데이터 호환용 4자리 학번 예: 1401 -> 2번째 자리 '4'가 반
    cls = parseInt(str.substring(1, 2), 10);
  } else {
    return '미배정';
  }

  if ([1, 5, 6].includes(cls)) return '1반실';
  if ([2, 4, 7].includes(cls)) return '2반실';
  if ([3, 8, 9].includes(cls)) return '3반실';
  
  return '미배정';
}
