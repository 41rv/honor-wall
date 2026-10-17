# مسار — الفرق بين Chrome وWebAPK في شريط النظام

التشخيص مبني على نتيجة الهاتف التي قدمها المستخدم، وManifest المنشور، وشيفرة Chromium الأصلية. لم تتغير شيفرة مسار أو هوية التطبيق أو البيانات، ولم يُنشر شيء جديد.

## النتيجة

يوجد **خلل موثق في Chromium يطابق الوصف مباشرة**: كانت تطبيقات WebAPK تلوّن شريط الحالة من لون Manifest، وتترك شريط التنقل السفلي عند لون Android الافتراضي. إصلاحه داخل المتصفح نفسه. هذه أقوى فرضية مدعومة حاليًا، لكن لا يمكن إسنادها قطعًا لإصدار الهاتف دون معرفة إصدار Chrome وAndroid والمتصفح المضيف لـWebAPK.

[إصلاح Chromium الأصلي، 0a6ab4f، بتاريخ ٦ أغسطس ٢٠٢٦](https://github.com/chromium/chromium/commit/0a6ab4f0e2ce17e572b05400ae6eacd7fc5389f0) يقول:

> Installed web apps colored the status bar from the manifest theme color but left the Android navigation bar at the platform default.

كان `WebappIntentDataProvider.getNavigationBarColor()` يعيد `null`؛ أضاف الإصلاح إعادة لون Manifest وتطبيقه في `BaseCustomTabActivity` لأن مسار WebAPK لا ينفذ مسار CustomTabActivity الذي كان يضبط الشريط. الإصلاح محكوم بميزة `WebAppNavigationBarThemeColor`. كان ملف `chrome/VERSION` وقت دخوله يحمل الإصدار الرئيسي **153**؛ هذا لا يثبت وجود الإصلاح وتفعيله في كل توزيع أو إصدار هاتف يحمل هذا الرقم.

ثيم الصفحة المحفوظ في localStorage لا يساوي الثيم الأصلي لنافذة Android. ولا يوفر Manifest حقلًا قياسيًا مستقلًا لضبط لون System Navigation Bar أو مؤشر الإيماءات. تختار شيفرة Chromium/Android اللون والتباين، ويختلف المسار أيضًا عند الرسم edge-to-edge. لا يوجد إصلاح موثوق إضافي في شيفرة الويب ثبت أنه يعالج هذه الحالة؛ لذلك لم تتكرر تعديلات CSS، ولم تُضف مفاتيح Manifest غير مدعومة أو تغييرات عرض تخفي الشريط.

## فحص Manifest المنشور

جُلب عبر HTTPS وطابق ملف بناء 1.1.2 حرفيًا:

| الحقل | القيمة |
| --- | --- |
| `display` | `standalone` |
| `display_override` | غير موجود؛ `display` هو الاختيار المعتمد |
| `theme_color` | `#185c4b` |
| `background_color` | `#185c4b` |
| `id` و`scope` و`start_url` | `/honor-wall/`، دون تغيير |

[نسخة Manifest المفحوصة](docs/webapk-navigation/live-manifest.json). لا توجد خلفية بيضاء في هذين اللونين. `background_color` يخص خلفية البدء ولا يثبت بحد ذاته لون شريط النظام. إضافة `display_override` لا تصلح الخلل الموثق؛ تغيير الوضع إلى fullscreen لا يُعتمد كحل لإخفاء العَرَض.

## WebAPK قديم رغم تحديث التطبيق

تحديث Service Worker الذي يطبقه زر «تحديث الآن» داخل مسار يحدّث ملفات الويب. تحديث حزمة WebAPK وبيانات Android Manifest المخزنة مسار آخر في Chromium؛ لا ينفذه هذا الزر، ولا يمكن لصفحة الويب فرضه بواجهة قياسية.

تثبت شيفرة `WebApkUpdateManager` أن اختلاف `background_color` و`theme_color` يُعد سبب تحديث للحزمة. وقد تتأخر الفحوص: المصدر المرجعي يعرّف فاصلًا عاديًا بيوم وفاصلًا مخففًا بثلاثين يومًا، مع إمكانية طلب فحص قسري. هذه قيم المصدر المرجعي، وليست موعدًا مضمونًا لهاتف المستخدم.

يمكن إثبات قدم الحزمة على الهاتف بمقارنة حقلي Theme color وBackground color في `chrome://webapks` مع اللون الحالي. ظهور الخلفية القديمة `#f6f7f2` يثبت أنها لم تتلقَّ تعديل 1.1.2. لكنه **لا يثبت أن قدم الخلفية وحده سبب الشريط الأبيض**. وإذا كانت القيم الحالية موجودة واستمر البياض، فإن فرضية «Manifest قديم» وحدها لا تفسره.

## الاختبار المقارن الذي نُفذ

نُفذت **٨ حالات** في Chromium 154 على سطح المكتب: نافذة browser ونافذة `--app`، والهويتان الأخضر والأحادي، والفاتح والداكن. رُصد `matchMedia(display-mode)` فعليًا: browser في الأولى وstandalone في الثانية؛ لم تُزوّر نتيجة matchMedia.

تطابقت قيم theme-color وcolor-scheme وخلفيات html/body/root لكل ثيم بين الوضعين. الأخضر الداكن `#101b17`، والأحادي الداكن `#121212`. [النتيجة](docs/webapk-navigation/comparison.json).

هذا يثبت اتساق مخرجات صفحة مسار بين نمطي العرض في Chromium المتاح. **لا يختبر Android أو حزمة WebAPK أو شريطه الأصلي**. لا adb أو محاكي Android أو هاتف متصل متاح. المقارنة الحاسمة لشريط النظام تحتاج الهاتف نفسه، خصوصًا نسخة Chrome المضيفة ونمط التنقل وإصدار Android. لا تُعاد اختبارات التطبيق الشاملة عند عدم تعديل شيفرته؛ الأدلة الجديدة خاصة بهذا التشخيص.

## الخطوة الآمنة التالية على الهاتف

1. في Chrome اكتب `chrome://webapks`، وابحث عن مسار المرتبط بـ`https://41rv.github.io/honor-wall/`. سجّل **Owning Browser** و**Theme color** و**Background color** و**Update Status** وتاريخ آخر تحديث. المتصفح المضيف قد يختلف عن Chrome الذي جُرّبت فيه الصفحة.
2. إذا كانت الألوان قديمة وظهر زر **Update مسار**، اضغطه مرة واحدة. وفق واجهة Chromium، يُطلب الفحص عند التشغيل التالي: افتح مسار المثبت متصلًا بالإنترنت، ثم أغلقه من التطبيقات الأخيرة وانتظر بضع دقائق، وافحص الحالة مجددًا. قد تظهر `Scheduled` قبل اكتمال التحديث. إذا كانت البيانات مطابقة فقد لا يجد تحديثًا؛ لا يُقدم هذا الطلب كضمان لحل الشريط.
3. حدّث Chrome المضيف تحديثًا عاديًا من المتجر دون إزالته، ثم أعد المقارنة بين الرابط والتطبيق المثبت. الإصلاح الموثق في شريط النظام يتطلب متصفحًا يحتويه ويُفعّله. لا حاجة لتعديل معرف مسار أو إعادة تثبيته.

زر Update في صفحة Chromium يستدعي `requestWebApkUpdate` ثم `ShortcutHelper.setForceWebApkUpdate` الذي يضبط علامة `setShouldForceUpdate(true)`؛ هذا المسار المفحوص لا يمسح IndexedDB. ليس زر «تحديث الآن» داخل مسار. لا تمسح بيانات الموقع أو تخزين Chrome ولا تُلغِ تثبيت التطبيق. إذا غابت الصفحة أو الزر في نسخة الهاتف، نتوقف عند تسجيل الإصدار ولا نستبدل الخطوة بإعادة تثبيت.

يلزم إصدار Chrome وAndroid وقيم الحزمة المخزنة لحسم الفرع الصحيح. تحديث Chrome/بيانات WebAPK خطوة تشخيصية آمنة، ولا يُدّعى أنها عالجت الهاتف قبل إعادة تجربته. إذا استمر البياض مع البيانات الحالية ومتصفح يحتوي الإصلاح، نتابع باعتباره اختلافًا في محرك Android/التفعيل/الرسم edge-to-edge ونوثقه لإبلاغ Chromium، دون ترقيعات CSS تخمينية.

## أدلة المصدر

[Commit الإصلاح](https://github.com/chromium/chromium/commit/0a6ab4f0e2ce17e572b05400ae6eacd7fc5389f0)، [VERSION عنده](https://github.com/chromium/chromium/blob/0a6ab4f0e2ce17e572b05400ae6eacd7fc5389f0/chrome/VERSION).

المراجع الأخرى مثبتة عند Chromium `e47056e273a5d2bf4bebdf47c5be9e52643c6fb5`:

- [ألوان شريط WebAPK](https://github.com/chromium/chromium/blob/e47056e273a5d2bf4bebdf47c5be9e52643c6fb5/chrome/android/java/src/org/chromium/chrome/browser/webapps/WebappIntentDataProvider.java).
- [اختلاف مسار النشاط وتطبيق اللون](https://github.com/chromium/chromium/blob/e47056e273a5d2bf4bebdf47c5be9e52643c6fb5/chrome/android/java/src/org/chromium/chrome/browser/customtabs/BaseCustomTabActivity.java).
- [فحص وتحديث Manifest للحزمة](https://github.com/chromium/chromium/blob/e47056e273a5d2bf4bebdf47c5be9e52643c6fb5/chrome/android/java/src/org/chromium/chrome/browser/webapps/WebApkUpdateManager.java).
- [فواصل الفحص](https://github.com/chromium/chromium/blob/e47056e273a5d2bf4bebdf47c5be9e52643c6fb5/chrome/android/java/src/org/chromium/chrome/browser/webapps/WebappDataStorage.java).
- [واجهة Update وتعليمات التنفيذ](https://github.com/chromium/chromium/blob/e47056e273a5d2bf4bebdf47c5be9e52643c6fb5/chrome/browser/resources/webapks/about_webapks.ts).
- [ضبط علامة الفحص دون حذف بيانات](https://github.com/chromium/chromium/blob/e47056e273a5d2bf4bebdf47c5be9e52643c6fb5/chrome/android/java/src/org/chromium/chrome/browser/ShortcutHelper.java).

[بيانات المصادر وبصماتها وحدود التحقق](docs/webapk-navigation/sources.json). التقارير الجديدة محلية فقط. شيفرة التطبيق والاعتماديات والمخطط والهوية وGitHub Pages كلها دون تغيير.
