insert into public.skills(name,category) values
('Calculus','Mathematics'),('Linear Algebra','Mathematics'),('Physics','Science'),('Chemistry','Science'),('Programming','CSE'),('Data Structures','CSE'),('Algorithms','CSE'),('Machine Learning','Research'),('Deep Learning','Research'),('Thermodynamics','Engineering'),('CAD','Engineering'),('Public Speaking','Professional'),('Research Writing','Research')
on conflict(name) do nothing;
insert into public.achievements(code,title,description,icon) values
('first_help','First Bridge','Complete your first peer-learning session','bridge'),
('teacher_5','Campus Mentor','Teach five completed sessions','school'),
('verified_skill','Verified Skill','Pass a server-scored skill verification','verified')
on conflict(code) do nothing;
