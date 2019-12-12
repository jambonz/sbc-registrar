insert into service_providers (service_provider_sid, name, root_domain, registration_hook, hook_basic_auth_user, hook_basic_auth_password) 
values ('3f35518f-5a0d-4c2e-90a5-2407bb3b36f0', 'SP A', 'jambonz.org', 'http://127.0.0.1:4000/auth', 'foo', 'bar');
insert into accounts(account_sid, service_provider_sid, name, sip_realm, registration_hook, hook_basic_auth_user, hook_basic_auth_password)
values ('ed649e33-e771-403a-8c99-1780eabbc803', '3f35518f-5a0d-4c2e-90a5-2407bb3b36f0', 'test account', 'sip.example.com', 'http://127.0.0.1:4000/auth', 'foo', 'bar');