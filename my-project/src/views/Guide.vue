<script setup>
// 가이드 페이지 로직 없음
</script>

<template>
  <div class="max-w-4xl mx-auto pb-20">
    <div class="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 md:p-12">
      
      <div class="text-center mb-12 border-b border-gray-200 pb-10">
        <h1 class="text-3xl md:text-4xl font-black text-gray-800 mb-4 tracking-tight">👨‍🏫 스마트 학급 & 동아리 관리 가이드</h1>
        <p class="text-gray-600 leading-relaxed text-lg">
          이 가이드는 초기 데이터 설정부터 AI 생기부 생성까지<br>
          <strong class="text-blue-600">효율적인 업무 흐름</strong>을 돕기 위해 작성되었습니다.
        </p>
      </div>

      <div class="space-y-16">
        
        <section>
          <h2 class="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
            <span class="text-orange-500">📋</span> 기초 데이터 수집 (설문 양식)
          </h2>
          <p class="text-sm text-gray-500 mb-4 leading-relaxed">
            학생들에게 구글 폼/네이버 폼으로 아래 문항을 배포하세요. 수집된 결과는 엑셀(CSV)로 내려받아 앱에 바로 등록할 수 있습니다.
          </p>
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="bg-orange-50 p-5 rounded-xl border border-orange-100">
              <h3 class="font-bold text-orange-800 mb-3 underline decoration-orange-300 underline-offset-4">학급 학생용 문항</h3>
              <ul class="text-xs space-y-2 text-orange-900/80 font-medium">
                <li>• 학번 (예: 10501)</li>
                <li>• 이름 / 성별</li>
                <li>• 연락처 / 보호자 연락처</li>
                <li>• 희망 진로 및 희망 대학</li>
                <li>• 취미 및 특기</li>
                <li>• 좋아하는 과목 / 싫어하는 과목</li>
                <li>• 나의 장점 및 칭찬할 점</li>
                <li>• 나의 단점 및 부족한 점</li>
              </ul>
            </div>
            <div class="bg-indigo-50 p-5 rounded-xl border border-indigo-100">
              <h3 class="font-bold text-indigo-800 mb-3 underline decoration-indigo-300 underline-offset-4">동아리 학생/활동용 문항</h3>
              <ul class="text-xs space-y-2 text-indigo-900/80 font-medium">
                <li>• 학번 / 이름</li>
                <li>• 동아리 내 역할 (기장, 부원 등)</li>
                <li>• 동아리 지원 동기</li>
                <li>• <strong>[활동 기록용]</strong> 활동 날짜</li>
                <li>• <strong>[활동 기록용]</strong> 활동 주제(명)</li>
                <li>• <strong>[활동 기록용]</strong> 활동 내용 및 느낀 점 (장문)</li>
              </ul>
            </div>
          </div>
        </section>

        <section>
          <h2 class="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
            <span class="text-green-500">📊</span> 데이터 일괄 등록 (TSV/CSV) 가이드
          </h2>
          
          <div class="space-y-6 text-gray-700">
            <div class="flex flex-col gap-4">
              <h3 class="text-lg font-bold text-gray-900 flex items-center gap-2">
                <span class="w-6 h-6 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-xs">1</span>
                엑셀 데이터 준비하기
              </h3>
              <p class="text-sm leading-relaxed">
                엑셀이나 구글 스프레드시트에서 데이터를 정리합니다. <strong>첫 줄(헤더)</strong>의 이름이 앱에서 요구하는 명칭과 일치해야 합니다.
              </p>
              
            </div>

            <div class="flex flex-col gap-4">
              <h3 class="text-lg font-bold text-gray-900 flex items-center gap-2">
                <span class="w-6 h-6 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-xs">2</span>
                데이터 복사 및 붙여넣기 (TSV 방식)
              </h3>
              <div class="bg-gray-50 p-5 rounded-xl border border-gray-200">
                <p class="text-sm mb-3 italic text-gray-600">"파일을 따로 저장할 필요 없이 바로 복사하세요!"</p>
                <ol class="list-decimal pl-5 space-y-2 text-sm">
                  <li>엑셀에서 등록할 범위(헤더 포함)를 마우스로 드래그하여 선택합니다.</li>
                  <li><kbd class="bg-white border shadow-sm px-1.5 py-0.5 rounded text-xs">Ctrl</kbd> + <kbd class="bg-white border shadow-sm px-1.5 py-0.5 rounded text-xs">C</kbd> 를 눌러 복사합니다.</li>
                  <li>앱의 <strong>[일괄 등록]</strong> 창에 있는 텍스트 영역을 클릭합니다.</li>
                  <li><kbd class="bg-white border shadow-sm px-1.5 py-0.5 rounded text-xs">Ctrl</kbd> + <kbd class="bg-white border shadow-sm px-1.5 py-0.5 rounded text-xs">V</kbd> 를 눌러 붙여넣은 후 등록 버튼을 누릅니다.</li>
                </ol>
              </div>
            </div>

            <div class="bg-blue-50 p-5 rounded-xl border border-blue-100">
              <h3 class="text-sm font-bold text-blue-800 mb-2">💡 업로드 형식 팁 (Header)</h3>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                <div class="bg-white p-2 rounded border border-blue-200">
                  <p class="font-bold text-blue-600 mb-1">[학생 등록]</p>
                  <code class="text-gray-500">학번, 이름, 성별, 연락처, 주소...</code>
                </div>
                <div class="bg-white p-2 rounded border border-blue-200">
                  <p class="font-bold text-blue-600 mb-1">[성적 등록]</p>
                  <code class="text-gray-500">학번, 시험명, 국어, 수학, 영어...</code>
                </div>
                <div class="bg-white p-2 rounded border border-blue-200">
                  <p class="font-bold text-blue-600 mb-1">[동아리 명단]</p>
                  <code class="text-gray-500">학번, 이름, 역할, 지원동기, 특기</code>
                </div>
                <div class="bg-white p-2 rounded border border-blue-200">
                  <p class="font-bold text-blue-600 mb-1">[동아리 활동]</p>
                  <code class="text-gray-500">학번, 날짜, 활동명, 내용</code>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h2 class="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
            <span class="text-blue-500">🤖</span> AI 생기부 생성 프로세스
          </h2>
          <div class="relative pl-8 border-l-2 border-blue-100 space-y-10">
            <div class="relative">
              <span class="absolute -left-[41px] top-0 w-5 h-5 bg-blue-500 rounded-full border-4 border-white shadow-sm"></span>
              <h4 class="font-bold text-gray-900 mb-1">상시 관찰 기록</h4>
              <p class="text-sm text-gray-600">학생 상세창의 [생기부] 탭에서 평소 관찰한 특징을 단어나 문장으로 자유롭게 메모하세요.</p>
            </div>
            <div class="relative">
              <span class="absolute -left-[41px] top-0 w-5 h-5 bg-blue-500 rounded-full border-4 border-white shadow-sm"></span>
              <h4 class="font-bold text-gray-900 mb-1">AI 초안 자동 완성</h4>
              <p class="text-sm text-gray-600">[✨ 새 초안 자동 생성]을 누르면 AI가 상담 기록, 활동 내역, 메모를 엮어 NEIS 분량에 맞춘 글을 씁니다.</p>
            </div>
            <div class="relative">
              <span class="absolute -left-[41px] top-0 w-5 h-5 bg-blue-500 rounded-full border-4 border-white shadow-sm"></span>
              <h4 class="font-bold text-gray-900 mb-1">최종 검토 및 저장</h4>
              <p class="text-sm text-gray-600">수정 요청 기능을 통해 문체를 다듬고, [⬆️ 최종 기록으로 가져오기]를 눌러 확정하세요.</p>
            </div>
          </div>
        </section>

      </div>
      
      <div class="mt-16 pt-8 border-t border-gray-100 text-center">
        <p class="text-xs text-gray-400">스마트 학급 다이어리 v1.0 | 교사의 소중한 시간을 응원합니다.</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar { width: 6px; }
.custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 4px; }
kbd { font-family: sans-serif; }
</style>