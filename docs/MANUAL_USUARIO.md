# Comprar-IA - Manual de Usuario

## Introducción

Comprar-IA es una plataforma de gestión fiscal para empresas venezolanas. Permite registrar facturas, calcular retenciones ISLR e IVA, gestionar pagos, generar libros de compras y conciliar movimientos bancarios, todo conforme a la normativa SENIAT.

---

## 1. Acceso al Sistema

### Iniciar Sesión
1. Abrir el navegador y acceder a la URL del sistema
2. Ingresar email y contraseña
3. Click en "Iniciar Sesión"

### Roles de Usuario
| Rol | Permisos |
|-----|----------|
| **Administrador** | Acceso total, configuración del sistema, gestión de usuarios |
| **Contador** | Facturas, retenciones, libro de compras, reportes |
| **Tesorero** | Pagos, conciliación bancaria, cuentas |
| **Operador** | Registro de facturas y proveedores (solo lectura en fiscal) |
| **Auditor** | Solo lectura en todos los módulos |

---

## 2. Dashboard

La pantalla principal muestra indicadores clave:
- **Facturas pendientes de pago** (cantidad y monto)
- **Pagos del mes** (total VES y USD)
- **Retenciones del período** (ISLR e IVA)
- **Tasa de cambio BCV** del día
- **Gráficos** de facturas y pagos por mes

---

## 3. Proveedores

### Registrar un Proveedor
1. Ir a **Proveedores** en el menú lateral
2. Click en **"Nuevo Proveedor"**
3. Completar:
   - **RIF**: Formato J-12345678-9, V-12345678-9, etc.
   - **Razón Social**: Nombre fiscal completo
   - **Dirección Fiscal**: Dirección completa
   - **Teléfono y Email**: Datos de contacto
   - **Tipo de Contribuyente**: Ordinario, Especial o No Sujeto
   - **Agente de Retención**: Si aplica
4. Click **"Guardar"**

### Buscar Proveedores
- Usar la barra de búsqueda por RIF o razón social
- Los proveedores se muestran en una tabla con paginación

---

## 4. Facturas

### Tipos de Documento
| Código | Tipo | Descripción |
|--------|------|-------------|
| FC | Factura de Compra | Compra a proveedor con control fiscal |
| FG | Factura de Gasto | Gastos operativos |
| ND | Nota de Débito | Ajuste de aumento sobre factura existente |
| NC | Nota de Crédito | Ajuste de disminución/devolución |
| DSF | Doc. Sin Formato | Documentos no fiscales |

### Registrar una Factura
1. Ir a **Facturas** > **"Nueva Factura"**
2. Seleccionar **proveedor** (buscando por RIF o nombre)
3. Completar:
   - **Tipo de documento**: FC, FG, ND, NC, DSF
   - **Número de factura**: Según el documento del proveedor
   - **Número de control**: Número fiscal (no aplica para DSF)
   - **Fecha de emisión**: Fecha del documento
   - **Fecha de recepción**: Fecha en que se recibió
   - **Moneda**: VES o USD
   - **Tasa de cambio**: Se carga automáticamente del BCV
4. Montos:
   - **Base imponible**: Monto sujeto a IVA
   - **Monto exento**: Monto exento de IVA
   - **Monto no sujeto**: Monto no sujeto a impuestos
   - **Tasa IVA**: 16%, 8% o 0%
   - El sistema calcula automáticamente: IVA, total, equivalentes VES/USD
5. Clasificación:
   - **Categoría de gasto**: Seleccionar la categoría
   - **Centro de costo**: Asignar departamento/área
6. Click **"Guardar"**

### Notas de Débito y Crédito
- Al seleccionar ND o NC, aparece el campo **"Factura Relacionada"**
- Seleccionar la factura original a la que aplica el ajuste
- El resto del proceso es igual

### Estados de una Factura
- **Registrada**: Recién ingresada
- **Pago Parcial**: Con un pago parcial registrado
- **Pagada**: Totalmente pagada
- **Anulada**: Cancelada (no aparece en libro de compras)

---

## 5. Retenciones

### Retención de IVA
- Se genera automáticamente al registrar factura a un proveedor ordinario
- Si la empresa es agente de retención especial: retiene 75% del IVA
- Si el proveedor no es agente de retención: retiene 100% del IVA
- Se genera comprobante PDF con el formato SENIAT

### Retención de ISLR
- Se genera automáticamente según las reglas configuradas
- Aplica según el tipo de actividad (concepto SENIAT) y monto
- Puede incluir sustracción de Unidades Tributarias según el concepto
- Se genera comprobante PDF

### Consultar Retenciones
1. Ir a **Retenciones** en el menú lateral
2. Filtrar por período, tipo (ISLR/IVA) o proveedor
3. Click en una retención para ver detalle y descargar comprobante PDF

---

## 6. Pagos

### Registrar un Pago
1. Ir a **Pagos** > Seleccionar factura pendiente
2. Seleccionar:
   - **Método de pago**: Transferencia, cheque, efectivo, punto de venta, Zelle, etc.
   - **Moneda**: VES o USD
   - **Monto**: Total o parcial
   - **Referencia**: Número de referencia bancaria
   - **Cuenta bancaria**: De dónde sale el pago
3. Click **"Registrar Pago"**
4. Se genera recibo de pago en PDF

### Pagos Parciales
- Puede pagar una factura en múltiples pagos
- El sistema lleva el control del saldo pendiente
- La factura pasa a estado "Pago Parcial" hasta completar

---

## 7. Libro de Compras

### Generar Libro de Compras
1. Ir a **Libro de Compras** en el menú lateral
2. Seleccionar el **período fiscal** (mes/año)
3. El sistema muestra todas las facturas del período con:
   - Datos del proveedor (RIF, razón social)
   - Datos del documento (tipo, número, control, fecha)
   - Desglose de montos (base imponible, exento, IVA)
   - Retenciones aplicadas

### Exportar
- **PDF**: Formato oficial para presentación al SENIAT
- **Excel**: Para análisis y auditoría
- **TXT SENIAT**: Formato especial para carga en portal SENIAT

### Cerrar Período
- Al cerrar un período, las facturas quedan bloqueadas
- No se pueden modificar facturas de un período cerrado
- Se genera un resumen final del período

---

## 8. Tasas de Cambio

### Consulta Automática BCV
- El sistema consulta automáticamente la tasa del BCV cada día
- La tasa se usa para conversiones VES/USD en facturas

### Ingresar Tasa Manual
1. Ir a **Tasas de Cambio**
2. Click **"Registrar Tasa Manual"**
3. Ingresar fecha y valor de la tasa
4. Útil para días festivos o cuando la consulta automática no está disponible

---

## 9. Conciliación Bancaria

### Configurar Cuentas Bancarias
1. Registrar las cuentas bancarias de la empresa
2. Indicar: banco, tipo de cuenta, número, moneda y saldo inicial

### Importar Movimientos
- Cargar movimientos bancarios del estado de cuenta
- El sistema los registra con fecha, referencia, débito/crédito

### Conciliación Automática
1. Seleccionar la cuenta bancaria
2. Click **"Conciliar Automático"**
3. El sistema busca coincidencias entre movimientos bancarios y pagos registrados
4. Cruza por: referencia, monto y fecha (±3 días)

### Conciliación Manual
- Para movimientos no identificados automáticamente
- Seleccionar el movimiento y asociarlo manualmente a un pago

### API Bancaria (Futuro)
- El módulo está preparado para conectar con APIs bancarias
- Cuando el banco proporcione credenciales API, se configuran en: **API Bancaria > Configurar**
- Permite sincronización automática de movimientos

---

## 10. Reportes

### Reportes Disponibles
- **Resumen de Compras**: Total de compras por período, proveedor, categoría
- **Retenciones por Período**: Detalle de ISLR e IVA retenido
- **Antigüedad de Deuda**: Facturas pendientes de pago y días de atraso
- **Gastos por Categoría**: Distribución de gastos por tipo
- **Gastos por Centro de Costo**: Distribución por departamento/área

---

## 11. Configuración

### Datos de la Empresa
- **RIF de la empresa**: RIF fiscal
- **Razón social**: Nombre de la empresa
- **Dirección**: Dirección fiscal
- **Contribuyente especial**: Si/No

### Unidad Tributaria
- Actualizar el valor de la UT cuando cambie (SENIAT publica actualizaciones)
- Afecta el cálculo de retenciones ISLR

### Categorías de Gasto
- Crear categorías para clasificar facturas (Servicios, Materiales, etc.)
- Cada categoría tiene código y descripción

### Centros de Costo
- Crear departamentos/áreas para asignar gastos
- Permite análisis de gastos por área de la empresa

### Reglas de Retención
- Configurar porcentajes de retención ISLR por concepto SENIAT
- Ajustar sustracciones en Unidades Tributarias

---

## 12. Seguridad

### Buenas Prácticas
- Cambiar contraseñas periódicamente
- No compartir credenciales de acceso
- Cerrar sesión al terminar de trabajar
- Usar contraseñas fuertes (mínimo 8 caracteres, mayúsculas, números)

### Auditoría
- Todas las acciones quedan registradas con: usuario, fecha, IP y detalle del cambio
- El administrador puede consultar el log de auditoría

---

## Soporte

Para soporte técnico o consultas:
- Email: soporte@comprar-ia.com
- Los administradores pueden acceder a la documentación API en `/api-docs`
