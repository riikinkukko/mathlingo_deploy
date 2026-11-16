-- Демо-репетитор для проверяющих Google Play (вместо teacher@demo.ru — тот
-- админ, его проверяющим давать нельзя): tutor@demo.ru / demo1234, тариф
-- «Профи», два ученика, занятия, оплата и отчёт. Создаётся только там, где
-- уже есть демо-данные (прод) — на чистой базе seed создаст своё, а эти
-- строки не мешают ему считать базу «чистой».
DO $$
DECLARE
  has_demo boolean := EXISTS (SELECT 1 FROM users WHERE email = 'teacher@demo.ru');
  has_tutor boolean := EXISTS (SELECT 1 FROM users WHERE email = 'tutor@demo.ru');
  today_msk timestamp := date_trunc('day', now() AT TIME ZONE 'Europe/Moscow');
BEGIN
  IF NOT has_demo OR has_tutor THEN
    RETURN;
  END IF;

  INSERT INTO users (id, name, email, password_hash, role, teacher_plan, teacher_tier, teacher_pro_until,
                     email_verified_at, consent_given_at, payment_instructions)
  VALUES ('u_review_tutor', 'Ольга Николаевна', 'tutor@demo.ru',
          '$2a$10$b8Kq3Tta6g4FlYWIonuIr.DEfnzCoc4oIYyfeFoTH/0X0Ub5HLeCK', 'TEACHER', 'pro', 'pro', '2030-01-01',
          now(), now(), 'Перевод по номеру телефона +7 900 000-00-00 (демо)');

  INSERT INTO users (id, name, email, password_hash, role, teacher_id, email_verified_at, consent_given_at,
                     lesson_price_rub, payment_reminders_enabled, target_score)
  VALUES
    ('u_review_st1', 'Дмитрий Смирнов', 'review.student1@demo.ru',
     '$2a$10$b8Kq3Tta6g4FlYWIonuIr.DEfnzCoc4oIYyfeFoTH/0X0Ub5HLeCK', 'STUDENT', 'u_review_tutor', now(), now(), 2000, true, 80),
    ('u_review_st2', 'Алина Кузнецова', 'review.student2@demo.ru',
     '$2a$10$b8Kq3Tta6g4FlYWIonuIr.DEfnzCoc4oIYyfeFoTH/0X0Ub5HLeCK', 'STUDENT', 'u_review_tutor', now(), now(), 2000, false, 70);

  -- Занятия: вчера проведено, сегодня вечером и через неделю — запланированы.
  INSERT INTO scheduled_lessons (id, teacher_id, student_id, starts_at, duration_min, topic, status)
  VALUES
    ('sl_review_1', 'u_review_tutor', 'u_review_st1', (today_msk - interval '1 day' + interval '17 hours') AT TIME ZONE 'Europe/Moscow', 60, 'Тригонометрические уравнения', 'done'),
    ('sl_review_2', 'u_review_tutor', 'u_review_st1', (today_msk + interval '18 hours') AT TIME ZONE 'Europe/Moscow', 60, 'Отбор корней', 'planned'),
    ('sl_review_3', 'u_review_tutor', 'u_review_st2', (today_msk + interval '1 day' + interval '16 hours') AT TIME ZONE 'Europe/Moscow', 90, 'Производная', 'planned'),
    ('sl_review_4', 'u_review_tutor', 'u_review_st1', (today_msk + interval '7 days' + interval '18 hours') AT TIME ZONE 'Europe/Moscow', 60, NULL, 'planned');

  INSERT INTO student_payments (id, teacher_id, student_id, amount_rub, lessons_count, paid_at, note)
  VALUES ('sp_review_1', 'u_review_tutor', 'u_review_st1', 8000, 4, (today_msk - interval '8 days')::date, 'Предоплата за 4 занятия');

  INSERT INTO lesson_logs (id, teacher_id, student_id, date, topic, report, lesson_id)
  VALUES ('ll_review_1', 'u_review_tutor', 'u_review_st1', (today_msk - interval '1 day')::date::text, 'Тригонометрические уравнения',
          E'Что делали: простейшие уравнения и формулы приведения.\nПолучилось: уверенно решает пункт а).\nПоработать над: отбор корней на отрезке.', 'sl_review_1');
END $$;
