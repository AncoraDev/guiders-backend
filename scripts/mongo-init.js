// Script de inicialización de MongoDB para crear usuario de aplicación
// Se ejecuta automáticamente cuando el contenedor se inicia por primera vez

console.log('====== INICIANDO CONFIGURACIÓN DE MONGODB ======');

// Detectar el entorno
const environment = process.env.NODE_ENV || 'development';
console.log(`Entorno detectado: ${environment}`);

// Obtener variables de entorno con valores por defecto según el entorno
const username = process.env.MONGODB_USERNAME || (environment === 'production' ? 'guiders_admin' : 'admin');
const password = process.env.MONGODB_PASSWORD || (environment === 'production' ? 'password' : 'admin');
const database = process.env.MONGODB_DATABASE || (environment === 'production' ? 'guiders_production' : 'guiders');

console.log(`Configurando base de datos: ${database}`);
console.log(`Creando usuario: ${username}`);
console.log(`Entorno: ${environment}`);

// Verificar que las variables críticas estén definidas
if (!process.env.MONGODB_USERNAME || !process.env.MONGODB_PASSWORD) {
  console.log(`⚠️  ADVERTENCIA: Variables de entorno no definidas, usando valores por defecto`);
  console.log(`   MONGODB_USERNAME: ${process.env.MONGODB_USERNAME ? 'DEFINIDA' : 'NO DEFINIDA'}`);
  console.log(`   MONGODB_PASSWORD: ${process.env.MONGODB_PASSWORD ? 'DEFINIDA' : 'NO DEFINIDA'}`);
  console.log(`   MONGODB_DATABASE: ${process.env.MONGODB_DATABASE ? 'DEFINIDA' : 'NO DEFINIDA'}`);
}

// Cambiar a la base de datos de la aplicación
// db = db.getSiblingDB(database); // Note: This is MongoDB shell specific, not Node.js

// Crear el usuario con permisos de lectura y escritura
try {
  db.createUser({
    user: username,
    pwd: password,
    roles: [
      {
        role: 'readWrite',
        db: database
      },
      {
        role: 'dbAdmin',
        db: database
      }
    ]
  });
  
  print(`✅ Usuario '${username}' creado exitosamente en la base de datos '${database}'`);
  
  // Verificar que el usuario fue creado
  const users = db.getUsers();
  print(`📋 Usuarios en la base de datos '${database}':`);
  users.users.forEach(user => {
    print(`  - ${user.user} (roles: ${user.roles.map(r => r.role).join(', ')})`);
  });
  
} catch (error) {
  if (error.code === 51003) {
    print(`⚠️  Usuario '${username}' ya existe en la base de datos '${database}'`);
  } else {
    print(`❌ Error creando usuario: ${error.message}`);
    throw error;
  }
}

// Crear una colección de prueba para verificar que todo funciona
try {
  db.test_connection.insertOne({
    message: 'MongoDB initialization successful',
    timestamp: new Date(),
    user: username,
    database: database
  });
  
  print('✅ Colección de prueba creada exitosamente');
  
  // Limpiar la colección de prueba
  db.test_connection.drop();
  print('🧹 Colección de prueba eliminada');
  
} catch (error) {
  print(`❌ Error en prueba de inserción: ${error.message}`);
}

print('====== CONFIGURACIÓN DE MONGODB COMPLETADA ======');
