const { test } = require('node:test');
const assert = require('node:assert/strict');
const { translateDynamic } = require('../src/desktop_dynamic');
test('customization counts keep their live numeric values', () => {
  assert.equal(translateDynamic('Show 67 breakdowns'), '67 Ayrıntıyı Göster');
  assert.equal(translateDynamic('Show 1 breakdown'), '1 Ayrıntıyı Göster');
  assert.equal(translateDynamic('1.148 / 20.000 tokens (5.7%)'), '1.148 / 20.000 token (5.7%)');
  assert.equal(translateDynamic('Show my breakdowns'), 'Show my breakdowns');
});
test('quota durations translate without freezing the countdown', () => {
  assert.equal(translateDynamic('Resets in 16h 24m'), '16 saat 24 dakika sonra yenilenir');
  assert.equal(translateDynamic('Resets in 1d 18h'), '1 gün 18 saat sonra yenilenir');
  assert.equal(translateDynamic('You have used some of your weekly limit, it will fully refresh in 16 hours, 24 minutes.'), 'Haftalık limitinizin bir kısmını kullandınız. Limit 16 saat, 24 dakika sonra tamamen yenilenir.');
  assert.equal(translateDynamic('You have hit your 5-hour limit, it will refresh in 2 hours, 22 minutes. If on a supported paid plan, you can use AI credits in the interim.'), 'Beş saatlik limitinize ulaştınız. Limit 2 saat, 22 dakika sonra yenilenir. Desteklenen ücretli bir plandaysanız bu sırada AI kredilerini kullanabilirsiniz.');
  assert.match(translateDynamic('You have hit your 5-hour limit, so the weekly limit does not currently apply. Your 5-hour limit will refresh in 2 hours, 22 minutes.'), /^Beş saatlik/);
  assert.equal(translateDynamic('(1.148 tokens)'), '(1.148 token)');
  for (const text of ['16h 24m', 'My project 123', 'Resets in unknown', 'Gemini 3.8 Flash']) assert.equal(translateDynamic(text), text);
});
test('baseline quota keeps date separate from the credit overage sentence', () => {
  const {translateDynamic}=require('../src/desktop_dynamic');
  assert.equal(translateDynamic("Your plan's baseline quota will refresh on 07.10.2026 11:36:49. To continue using this model now, enable AI Credit overages."), 'Planınızın temel kotası 07.10.2026 11:36:49 tarihinde yenilenecek. Bu modeli şimdi kullanmaya devam etmek için AI kredisiyle kota aşımını etkinleştirin.');
});
test('weekly limit notice preserves the changing refresh duration', () => {
  const {translateDynamic}=require('../src/desktop_dynamic');
  assert.equal(translateDynamic('You have hit your weekly limit, the 5-hour limit does not currently apply. Your weekly limit will fully refresh in 4 days, 23 hours.'), 'Haftalık limitinize ulaştınız; beş saatlik limit şu anda geçerli değil. Haftalık limitiniz 4 gün, 23 saat sonra tamamen yenilenir.');
});

test('tool status templates preserve paths, quoted queries, and unknown text', () => {
  const cases = [
    ['Finding files in C:/Work/My Project','Dosyalar aranıyor: C:/Work/My Project'],
    ['Searching src for "Save"','src içinde aranıyor: "Save"'],
    ['Generating image','Görsel oluşturuluyor']
  ];
  for(const [input,output] of cases) {assert.equal(translateDynamic(input),output);assert.equal(translateDynamic(output),output);}
  for(const input of ['Searching for a solution is useful','Searching src for unquoted text','git status','Reading file timed out.']) assert.equal(translateDynamic(input),input);
});
