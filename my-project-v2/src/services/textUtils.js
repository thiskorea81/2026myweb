// NEIS 생기부 바이트 수 계산 (한글 3바이트, 영문/기호/공백 1바이트)
export const getNeisByteLength = (str) => {
    let byteLength = 0
    if (!str) return 0
    for (let i = 0; i < str.length; i++) {
      const charCode = str.charCodeAt(i)
      if (charCode <= 0x00007F) byteLength += 1
      else if (charCode <= 0x0007FF) byteLength += 2
      else byteLength += 3
    }
    return byteLength
  }