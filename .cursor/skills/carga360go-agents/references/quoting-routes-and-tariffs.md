# Cotizador inteligente auditable

Cotizar con origen/destino geocodificados, distancia y duración por ruta apropiada para camión, categoría de vehículo, ejes, carga, capacidad, restricciones, combustible, peajes, chofer, mantenimiento, neumáticos, depreciación, seguros, gastos generales, tiempos de espera y margen. No asumir que OSRM estándar incorpora restricciones de vehículos pesados.

## Cálculo
- Litros = kilómetros / rendimiento_km_por_litro; combustible = litros * CLP_litro.
- Costo_base = combustible + peajes + conductor + mantenimiento + neumáticos + costos_fijos_prorrateados + extras.
- Precio_neto = costo_base / (1 - margen_objetivo), con margen en [0,1). Distinguir margen de recargo.
- Impuestos, comisiones y descuentos separados, según condiciones efectivamente vigentes.
- Si faltan coordenadas, ejes, valores vigentes o la ruta es dudosa, marcar `requiere_revision`, no inventar peajes ni distancia.

Guardar por cotización: entradas normalizadas, fuente/fecha de cada tarifa, versión del algoritmo, geometría y corredor, desglose, moneda, vigencia, nivel de confianza, usuario y auditoría. Comparar rutas alternativas y retorno vacío cuando tenga sentido.

## Pruebas obligatorias
Antofagasta–Santiago como regresión; ruta ida/vuelta, peajes por ejes, tramos urbanos, combustible cero, decimales CLP, valores extremos, Nominatim sin resultados, OSRM caído, tarifa vencida y desvíos. Prohibido reemplazar fuentes normativas por una cifra inventada. Validar en staging con escenarios reales antes de habilitar cotización vinculante.
