# إعداد Supabase وGitHub — خطوات من الآيباد

إعداد مرة واحدة فقط، ويستغرق حوالي 20 دقيقة. افتحي **Safari** على الآيباد.
احتفظي بتطبيق **الملاحظات** مفتوحاً بجانبه لتنسخي فيه ما يُطلب حفظه.

> ⚠️ **ما يُرسل في المحادثة وما لا يُرسل أبداً**
> - **يُرسل لـ Claude:** «Project URL» و«Publishable key» فقط. هذان عامّان بطبيعتهما، والحماية تأتي من قفل البيانات بتسجيل الدخول.
> - **لا يُرسل أبداً لأحد، ولا يُكتب في المحادثة:** كلمة مرور قاعدة البيانات، و«Secret key»، وكلمة سر النسخ الاحتياطي. هذه تُلصق فقط في GitHub كما في الجزء (هـ).

---

## (أ) إنشاء الحساب والمشروع
1. ادخلي إلى **supabase.com** واضغطي **Start your project**.
2. اختاري **Continue with GitHub** وادخلي بحساب GitHub نفسه (amaln808)، ثم اضغطي **Authorize**.
3. إذا طُلب إنشاء «Organization»: الاسم `Zawrda`، والنوع **Personal**، والخطة **Free** ← **Create organization**.
4. في صفحة **New project**:
   - **Project name:** `zawrda`
   - **Database Password:** اضغطي **Generate a password**، ثم انسخيها والصقيها في الملاحظات بعنوان «كلمة مرور قاعدة البيانات». ⚠️ يجب أن تكون **حروفاً إنجليزية وأرقاماً فقط**، دون رموز مثل `@` أو `:` أو `/` أو `#`، لأنها توضع داخل رابط.
   - **Region:** اختاري أقرب منطقة للشرق الأوسط إن ظهرت، وإلا **Central EU (Frankfurt)**.
   - اضغطي **Create new project**.
5. انتظري دقيقة أو دقيقتين حتى تختفي عبارة «Setting up project».

## (ب) إيقاف التسجيل لأي شخص آخر (قبل إنشاء حسابك)
1. من القائمة الجانبية اختاري **Authentication** (أيقونة الأشخاص).
2. اختاري **Sign In / Providers**. قد تظهر باسم **Providers** أو داخل **Settings**.
3. أطفئي خيار **Allow new users to sign up**.
4. اضغطي **Save**.

## (ج) إنشاء حسابك أنتِ
1. في **Authentication** اختاري **Users**.
2. اضغطي **Add user** ثم **Create new user**.
3. اكتبي بريدك وكلمة مرور قوية، وفعّلي **Auto Confirm User**.
4. اضغطي **Create user**.
5. احفظي كلمة المرور في **سلسلة مفاتيح iCloud** (يعرضها Safari عند أول دخول للتطبيق)، حتى يملأها الآيباد ببصمة الوجه.

> أول حساب يُنشأ يصبح تلقائياً «صاحبة المشروع». أي حساب بعده لا يرى أي بيانات.

## (د) أرسلي لـ Claude هاتين القيمتين
1. اضغطي زر **Connect** أعلى الصفحة. أو ادخلي **Project Settings** (الترس) ثم **API Keys**.
2. انسخي **Project URL**، ويبدو هكذا: `https://abcdxyz.supabase.co`.
3. انسخي **Publishable key**، ويبدأ بـ `sb_publishable_`. إن لم يظهر فانسخي **anon public**.
4. أرسليهما في المحادثة.

## (هـ) ثلاثة أسرار في GitHub (للنسخ الاحتياطي وتحديث قاعدة البيانات تلقائياً)
افتحي **github.com/amaln808/--amaln808** ثم **Settings** ثم **Secrets and variables** ثم **Actions** ثم **New repository secret**. أضيفي كل سرّ مما يلي ثم اضغطي **Add secret**:

1. **الاسم:** `SUPABASE_DB_PASSWORD`
   - **القيمة:** كلمة مرور قاعدة البيانات **وحدها**، كما نسختِها من Supabase (لا رابط ولا تعديل).
   - إن لم تكن معك: افتحي https://supabase.com/dashboard/project/ekgykjfbodyylyozgqft/database/settings ← **Reset database password** ← **Generate a password** ← زر النسخ ← **Reset password**.
2. **الاسم:** `SUPABASE_SECRET_KEY`
   - في Supabase: **Project Settings** ثم **API Keys** ثم **Secret keys**.
   - اضغطي العين أو **Reveal**، وانسخي المفتاح الذي يبدأ بـ `sb_secret_`. إن لم يظهر فانسخي **service_role**.
3. **الاسم:** `BACKUP_PASSPHRASE`
   - اكتبي جملة طويلة تتذكرينها، مثلاً أربع كلمات وأرقام.
   - **اكتبيها على ورقة واحفظيها خارج الآيباد.** من دونها لا يمكن فتح النسخ الاحتياطية.

## (و) المنبّه الاحتياطي في cron-job.org (بعد أن يرسل لك Claude الرابط)
1. ادخلي **cron-job.org** واضغطي **Sign up**. الحساب مجاني، وأكّدي البريد.
2. اضغطي **Create cronjob**.
3. **Title:** `Zawrda ping`.
4. **URL:** الصقي الرابط الذي سيرسله لك Claude.
5. **Execution schedule:** اختاري **Every day** في أي ساعة.
6. اضغطي **Create**.

---

بعد إنهاء هذه الخطوات أخبري Claude. سيضيف الرابط والمفتاح إلى التطبيق ويدمج التحديث. بعدها:
1. تُنشأ الجداول تلقائياً.
2. يُنشر التطبيق على الرابط نفسه: https://amaln808.github.io/--amaln808/
3. تظهر شاشة تسجيل الدخول.
