import * as THREE from 'three';

// Временная заглушка для анимационной библиотеки (если потребуется)
// import { TWEEN } from 'three/examples/jsm/libs/tween.module.min';

export class SkillAnimator {
    constructor(sceneManager) {
        this.sceneManager = sceneManager;
        console.log("SkillAnimator инициализирован");
    }

    /**
     * Запускает анимацию для указанного скилла.
     * @param {object} skill - Объект скилла из UnitFactory.
     * @param {Unit} caster - Юнит, использующий скилл.
     * @param {Unit | {x: number, z: number}} target - Цель скилла (юнит или координаты).
     * @param {Unit[]} [aoeTargets] - Массив юнитов, затронутых AOE (если применимо).
     */
    playSkillAnimation(skill, caster, target, aoeTargets = []) {
        console.log(`Запуск анимации для скилла: ${skill.name} от ${caster.type} к`, target);

        // Определяем тип анимации на основе скилла
        switch (skill.effectType) {
            case 'damage':
            case 'damage+stun':
                if (skill.attackPattern === 'line') { // Землетрясение
                    this.animateLineAOE(skill, caster, target);
                } else if (skill.aoe && skill.aoeRange === 1 && skill.range === 0) { // Королевский гнев
                    this.animateRadialAOE(skill, caster);
                } else if (skill.aoe) { // Огненный шар
                    this.animateProjectile(skill, caster, target, () => {
                        this.animateExplosion(skill, target, aoeTargets);
                    });
                } else if (skill.range > 1 || skill.attackPattern === 'diagonal') { // Точный бросок, Святое пламя
                    this.animateProjectile(skill, caster, target, () => {
                         // Возможно, добавить эффект попадания на цель
                        this.animateImpactEffect(target);
                    });
                } else { // Кавалерийский бросок (пока без спец. анимации), обычная атака (если будет через скилл)
                    // Можно добавить простую анимацию удара или выпад
                    this.animateMeleeAttack(caster, target);
                    if (skill.effectType === 'damage+stun') {
                       this.animateStunEffect(target);
                    }
                }
                break;
            case 'heal':
            case 'heal+cleanse':
            case 'heal+mana': // Лечение (Исцеляющая молитва, Королевское благословение)
                // Запускаем анимацию лечения на цели (если цель - юнит)
                if (target instanceof Unit) {
                    this.animateHealEffect(target);
                }
                if (skill.global) { // Королевское благословение
                   this.animateGlobalEffect(skill, caster); // Анимация для всех союзников
                }
                break;
            case 'buff':
                // Анимация баффа теперь обрабатывается кольцом в Unit.js
                // Можно добавить звук или небольшой эффект каста у caster, если нужно
                console.log(`SkillAnimator: Пропуск анимации для баффа ${skill.name}, будет показано кольцо.`);
                break;
            case 'debuff':
                // Анимация дебаффа теперь обрабатывается кольцом в Unit.js
                console.log(`SkillAnimator: Пропуск анимации для дебаффа ${skill.name}, будет показано кольцо.`);
                break;
            case 'shield':
                // Анимация щита теперь обрабатывается кольцом в Unit.js
                console.log(`SkillAnimator: Пропуск анимации для щита ${skill.name}, будет показано кольцо.`);
                break;
            default:
                console.warn(`Неизвестный тип эффекта для анимации: ${skill.effectType}`);
        }
    }

    /**
     * Анимация полета снаряда от кастера к цели.
     * @param {object} skill - Объект скилла.
     * @param {Unit} caster - Юнит, использующий скилл.
     * @param {Unit | {x: number, z: number}} target - Цель скилла.
     * @param {function} onComplete - Колбэк после завершения полета.
     */
    animateProjectile(skill, caster, target, onComplete) {
        console.log(`Анимация снаряда: ${skill.name}`);
        const startPosition = caster.model.position.clone().add(new THREE.Vector3(0, 0.1, 0)); // Немного над кастером
        const endPosition = this.getTargetPosition(target);

        if (!endPosition) {
            console.error("Не удалось определить позицию цели для снаряда.");
            if (onComplete) onComplete();
            return;
        }

        // Создаем геометрию и материал для снаряда
        let projectileColor = 0xffff00; // Желтый по умолчанию
        if (skill.name === 'Огненный шар') projectileColor = 0xff4500; // Оранжево-красный
        if (skill.name === 'Святое пламя') projectileColor = 0xffd700; // Золотой

        // Возвращаем адекватный размер, но чуть больше для видимости
        const geometry = new THREE.SphereGeometry(1, 16, 16); // Увеличиваем до 0.3
        const material = new THREE.MeshBasicMaterial({ color: projectileColor });
        const projectile = new THREE.Mesh(geometry, material);
        projectile.position.copy(startPosition);

        // Добавляем снаряд на сцену
        this.sceneManager.scene.add(projectile);

        const duration = 0.5; // Длительность полета в секундах
        let elapsedTime = 0;

        // Функция анимации
        const animate = (deltaTime) => {
            elapsedTime += deltaTime;
            const progress = Math.min(elapsedTime / duration, 1);

            projectile.position.lerpVectors(startPosition, endPosition, progress);

            if (progress >= 1) {
                // Анимация завершена
                this.sceneManager.scene.remove(projectile);
                // Убираем эту функцию из цикла обновления
                this.sceneManager.removeAnimationCallback(animationCallback);
                console.log(`Снаряд ${skill.name} достиг цели.`);
                if (onComplete) {
                    onComplete();
                }
            }
        };
        
        // Добавляем функцию анимации в цикл обновления sceneManager
        // Предполагается, что sceneManager имеет методы addAnimationCallback/removeAnimationCallback
        const animationCallback = (time, deltaTime) => animate(deltaTime);
        this.sceneManager.addAnimationCallback(animationCallback);
    }

    /**
     * Анимация взрыва или эффекта на основной цели AOE скилла.
     * @param {object} skill - Объект скилла.
     * @param {Unit | {x: number, z: number}} target - Центр AOE.
     * @param {Unit[]} aoeTargets - Юниты, затронутые AOE.
     */
    animateExplosion(skill, target, aoeTargets) {
        console.log(`Анимация взрыва: ${skill.name} в точке`, target);

        const targetPosition = this.getTargetPosition(target);
        if (!targetPosition) return;

        let explosionColor = 0xffa500; // Оранжевый по умолчанию
        if (skill.name === 'Огненный шар') explosionColor = 0xff4500; // Оранжево-красный

        // Создаем эффект взрыва (увеличивающаяся сфера)
        this.createExpandingSphereEffect(targetPosition, explosionColor, 0.15, 0.6);

        // Placeholder: Вывод в консоль
        aoeTargets.forEach(unit => {
            console.log(` - Юнит ${unit.type} (${unit.position.x},${unit.position.z}) задет взрывом`);
        });
    }
     /**
     * Анимация эффекта удара/попадания на цели.
     * @param {Unit | {x: number, z: number}} target - Цель.
     */
    animateImpactEffect(target) {
        const targetPosition = this.getTargetPosition(target);
        if (!targetPosition) {
            console.error("animateImpactEffect: Не удалось получить позицию цели.");
            return;
        }

        console.log(`Анимация попадания в`, targetPosition);
        // Создаем эффект попадания (маленькая быстрая вспышка)
        this.createExpandingSphereEffect(targetPosition, 0xffffff, 0.08, 0.4); // Белая вспышка
    }

    /**
     * Анимация линейной AOE атаки (например, Землетрясение).
     * @param {object} skill - Объект скилла.
     * @param {Unit} caster - Юнит, использующий скилл.
     * @param {Unit | {x: number, z: number}} target - Конечная точка линии (или первая цель).
     */
    animateLineAOE(skill, caster, target) {
        console.log(`Анимация линейного AOE: ${skill.name}`);

        const startPosition = caster.model.position.clone();
        const endPosition = this.getTargetPosition(target);
        if (!endPosition) return;

        const distance = startPosition.distanceTo(endPosition);
        if (distance === 0) return; // Не анимируем, если цель = кастер

        const direction = new THREE.Vector3().subVectors(endPosition, startPosition).normalize();
        const effectColor = 0x8B4513; // Коричневый (SaddleBrown)
        const duration = 0.7;
        const effectWidth = 10.0; // Ширина эффекта (по оси X бокса)
        const effectHeight = 0.02; // Небольшая толщина эффекта (по оси Y)

        // Создаем "ползущий" прямоугольник -> ЗАМЕНЯЕМ НА БОКС
        const boxGeometry = new THREE.BoxGeometry(effectWidth, effectHeight, 0.01); // Width X, Height Y, Length Z (starts small)
        const boxMaterial = new THREE.MeshBasicMaterial({
            color: effectColor,
            transparent: true,
            opacity: 0.8 // Увеличиваем начальную непрозрачность
        });
        const lineEffect = new THREE.Mesh(boxGeometry, boxMaterial);

        // --- Начальное позиционирование и ориентация --- 
        // Центр бокса в начале немного смещен от кастера
        const initialCenterOffset = direction.clone().multiplyScalar(0.01 / 2);
        const initialCenterPosition = startPosition.clone().add(initialCenterOffset);
        lineEffect.position.copy(initialCenterPosition);
        lineEffect.position.y += effectHeight / 2 + 0.001; // Половина высоты + чуть выше земли

        // Ориентируем бокс так, чтобы его локальная ось Z (длина) смотрела на цель
        const lookAtTarget = endPosition.clone();
        lookAtTarget.y = lineEffect.position.y; // Смотрим горизонтально
        lineEffect.lookAt(lookAtTarget);
        // --- Конец позиционирования и ориентации ---

        this.sceneManager.scene.add(lineEffect);

        let elapsedTime = 0;
        const animate = (deltaTime) => {
            elapsedTime += deltaTime;
            // Ограничиваем progress, чтобы избежать проблем при лагах
            const progress = Math.min(elapsedTime / duration, 1); 

            // Анимация длины и позиции
            const currentLength = THREE.MathUtils.lerp(0.01, distance, progress);

            // --- Обновляем геометрию (Z - длина) --- 
            lineEffect.geometry.dispose();
            lineEffect.geometry = new THREE.BoxGeometry(effectWidth, effectHeight, currentLength);
            
            // --- Обновляем позицию центра --- 
            const currentCenterOffset = direction.clone().multiplyScalar(currentLength / 2);
            const currentCenterPosition = startPosition.clone().add(currentCenterOffset);
            lineEffect.position.copy(currentCenterPosition);
            lineEffect.position.y = startPosition.y + effectHeight / 2 + 0.001; // Держим на той же высоте
            
            // Переориентация не нужна, т.к. направление не меняется
            // lineEffect.lookAt(lookAtTarget);

            // Анимация исчезновения
            lineEffect.material.opacity = THREE.MathUtils.lerp(0.8, 0, progress);

            if (progress >= 1) {
                this.sceneManager.scene.remove(lineEffect);
                this.sceneManager.removeAnimationCallback(animationCallback);
            }
        };

        const animationCallback = (time, deltaTime) => animate(deltaTime);
        this.sceneManager.addAnimationCallback(animationCallback);
    }

    /**
     * Анимация радиальной AOE атаки вокруг кастера (например, Королевский гнев).
     * @param {object} skill - Объект скилла.
     * @param {Unit} caster - Юнит, использующий скилл.
     */
    animateRadialAOE(skill, caster) {
        console.log(`Анимация радиального AOE: ${skill.name} вокруг ${caster.type}`);

        const casterPosition = caster.model.position.clone();
        const effectColor = 0xff4500; // Оранжево-красный для гнева
        let maxRadius;

        // --- DEBUG: Проверяем squareSize --- 
        console.log(`RadialAOE - squareSize: ${this.sceneManager.board?.squareSize}`);
        if (typeof this.sceneManager.board?.squareSize !== 'number' || this.sceneManager.board.squareSize <= 0) {
             console.error("RadialAOE - board.squareSize is invalid! Using fallback radius.");
             maxRadius = (skill.aoeRange || 1) * 1.5; // Запасной радиус, если squareSize не найден
        } else {
             maxRadius = (skill.aoeRange || 1) * (this.sceneManager.board.squareSize * 1.5); // Используем squareSize
        }
        // --- END DEBUG ---

        // --- DEBUG: Проверяем tileSize --- 
        console.log(`RadialAOE - tileSize: ${this.sceneManager.board?.tileSize}, Calculated maxRadius: ${maxRadius}`);
        if (isNaN(maxRadius) || maxRadius <= 0) {
            console.error("RadialAOE - maxRadius is invalid! Cannot start animation.");
            return; // Не запускаем анимацию, если радиус некорректен
        }
        // --- END DEBUG ---
        const duration = 1.2; // Замедляем анимацию

        const ringGeometry = new THREE.RingGeometry(0.1, 0.2, 32); // Начинаем с более заметного кольца (inner=0.1, outer=0.2)
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: effectColor,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.9 // Увеличиваем начальную непрозрачность
        });
        const ringEffect = new THREE.Mesh(ringGeometry, ringMaterial);
        ringEffect.position.copy(casterPosition);
        ringEffect.position.y += 0.05; // Поднимем чуть выше
        ringEffect.rotation.x = -Math.PI / 2; // Горизонтально

        this.sceneManager.scene.add(ringEffect);

        let elapsedTime = 0;
        const animate = (deltaTime) => {
            elapsedTime += deltaTime;
            const progress = Math.min(elapsedTime / duration, 1);

            // Анимация радиуса и прозрачности
            const currentOuterRadius = THREE.MathUtils.lerp(0.2, maxRadius, progress);
            const currentInnerRadius = currentOuterRadius * 0.5; // Делаем кольцо еще толще (50% от внешнего радиуса)
            
            // --- DEBUG & SAFETY CHECK --- 
            if (isNaN(currentOuterRadius) || isNaN(currentInnerRadius) || currentOuterRadius <= 0 || currentInnerRadius <= 0 || currentInnerRadius >= currentOuterRadius) {
                console.error(`Invalid radii calculated! Skipping frame. Outer: ${currentOuterRadius}, Inner: ${currentInnerRadius}. Progress: ${progress}`);
                // Если прогресс уже 1, надо завершить анимацию, чтобы не висела вечно
                if (progress >= 1) {
                    this.sceneManager.scene.remove(ringEffect);
                    this.sceneManager.removeAnimationCallback(animationCallback);
                }
                return; // Пропускаем обновление геометрии в этом кадре
            }
            // --- END DEBUG & SAFETY CHECK --- 

            ringEffect.geometry.dispose(); // Удаляем старую геометрию
            ringEffect.geometry = new THREE.RingGeometry(currentInnerRadius, currentOuterRadius, 32);
            ringEffect.material.opacity = THREE.MathUtils.lerp(0.9, 0, progress);

            // Временный лог для отладки
            // console.log(`RadialAOE - progress: ${progress.toFixed(2)}, outerR: ${currentOuterRadius.toFixed(2)}, innerR: ${currentInnerRadius.toFixed(2)}, opacity: ${ringEffect.material.opacity.toFixed(2)}`);

            if (progress >= 1) {
                this.sceneManager.scene.remove(ringEffect);
                this.sceneManager.removeAnimationCallback(animationCallback);
            }
        };

        const animationCallback = (time, deltaTime) => animate(deltaTime);
        this.sceneManager.addAnimationCallback(animationCallback);
    }

    /**
     * Анимация эффекта лечения на цели.
     * @param {Unit | {x: number, z: number}} target - Цель лечения.
     */
    animateHealEffect(target) {
        const targetUnit = target instanceof Unit ? target : null;
        if (!targetUnit) return;
        console.log(`Анимация лечения на ${targetUnit.type}`);

        const effectColor = 0x00ff00; // Зеленый цвет
        const effectSize = 0.08; // Немного больше юнита
        const duration = 0.7; // Длительность эффекта в секундах

        const geometry = new THREE.SphereGeometry(effectSize, 16, 8);
        const material = new THREE.MeshBasicMaterial({
            color: effectColor,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide // Видимость изнутри и снаружи
        });
        const healEffect = new THREE.Mesh(geometry, material);

        // Позиционируем эффект в центре юнита (у его ног)
        healEffect.position.copy(targetUnit.model.position);
        healEffect.position.y += 0.01; // Чуть выше земли

        this.sceneManager.scene.add(healEffect);

        let elapsedTime = 0;
        const animate = (deltaTime) => {
            elapsedTime += deltaTime;
            const progress = elapsedTime / duration;

            if (progress < 0.5) {
                // Фаза появления и роста (можно добавить scale)
                healEffect.material.opacity = THREE.MathUtils.lerp(0, 0.6, progress * 2);
            } else {
                // Фаза исчезновения
                healEffect.material.opacity = THREE.MathUtils.lerp(0.6, 0, (progress - 0.5) * 2);
            }

            if (progress >= 1) {
                this.sceneManager.scene.remove(healEffect);
                this.sceneManager.removeAnimationCallback(animationCallback);
                console.log(`Анимация лечения на ${targetUnit.type} завершена.`);
            }
        };

        const animationCallback = (time, deltaTime) => animate(deltaTime);
        this.sceneManager.addAnimationCallback(animationCallback);
    }

    /**
     * Анимация глобального эффекта (например, Королевское благословение).
     * @param {object} skill - Объект скилла.
     * @param {Unit} caster - Юнит, использующий скилл.
     */
    animateGlobalEffect(skill, caster) {
        console.log(`Анимация глобального эффекта: ${skill.name}`);

        // Используем модифицированный эффект расширяющейся сферы для глобальной вспышки
        const casterPosition = caster.model.position.clone();
        let effectColor = 0x00ff00; // Зеленый для лечения по умолчанию
        if (skill.name === 'Королевское благословение') effectColor = 0xffd700; // Золотой

        // Позиция в центре доски или над кастером?
        // Пока оставим над кастером
        this.createExpandingSphereEffect(casterPosition, effectColor, 1.0, 1.2); // Большая сфера, дольше длительность

        // TODO: Можно добавить эффекты на каждого союзника отдельно, если нужно
    }

    /**
     * Анимация атаки ближнего боя.
     * @param {Unit} caster - Атакующий юнит.
     * @param {Unit | {x: number, z: number}} target - Атакуемая цель.
     */
    animateMeleeAttack(caster, target) {
        console.log(`Анимация атаки ближнего боя: ${caster.type} -> ${target.type || 'координаты'}`);

        const startPosition = caster.model.position.clone();
        const targetPosition = this.getTargetPosition(target);
        if (!targetPosition) return;

        const lungeDistance = 0.1; // Насколько далеко делать выпад
        const duration = 0.4; // Быстрая анимация

        const direction = new THREE.Vector3().subVectors(targetPosition, startPosition).normalize();
        const lungePosition = startPosition.clone().add(direction.multiplyScalar(lungeDistance));

        let elapsedTime = 0;
        const animate = (deltaTime) => {
            elapsedTime += deltaTime;
            const progress = Math.min(elapsedTime / duration, 1);

            // Фаза выпада (первая половина анимации)
            if (progress < 0.5) {
                caster.model.position.lerpVectors(startPosition, lungePosition, progress * 2);
            } else { // Фаза возврата (вторая половина анимации)
                caster.model.position.lerpVectors(lungePosition, startPosition, (progress - 0.5) * 2);
            }

            if (progress >= 1) {
                caster.model.position.copy(startPosition); // Гарантируем возврат в исходное положение
                this.sceneManager.removeAnimationCallback(animationCallback);
                console.log(`Анимация выпада ${caster.type} завершена.`);
            }
        };

        const animationCallback = (time, deltaTime) => animate(deltaTime);
        this.sceneManager.addAnimationCallback(animationCallback);
    }

    /**
     * Анимация оглушения на цели.
     * @param {Unit | {x: number, z: number}} target - Цель оглушения.
     */
    animateStunEffect(target) {
        // Анимация оглушения теперь обрабатывается кольцом в Unit.js (красное кольцо дебаффа)
        console.log(`SkillAnimator: Пропуск анимации для оглушения, будет показано кольцо.`);
    }

    /**
     * Создает и анимирует эффект расширяющейся и исчезающей сферы.
     * Используется для взрывов и попаданий.
     * @param {THREE.Vector3} position - Позиция эффекта.
     * @param {number} color - Цвет эффекта (hex).
     * @param {number} maxSize - Максимальный размер сферы.
     * @param {number} duration - Длительность эффекта в секундах.
     */
    createExpandingSphereEffect(position, color, maxSize, duration) {
        const geometry = new THREE.SphereGeometry(0.01, 16, 8); // Начинаем с маленького размера
        const material = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide
        });
        const effectMesh = new THREE.Mesh(geometry, material);
        effectMesh.position.copy(position);

        this.sceneManager.scene.add(effectMesh);

        let elapsedTime = 0;
        const animate = (deltaTime) => {
            elapsedTime += deltaTime;
            const progress = Math.min(elapsedTime / duration, 1);

            // Анимация размера и прозрачности
            const currentSize = THREE.MathUtils.lerp(0.01, maxSize, progress);
            effectMesh.scale.set(currentSize / 0.01, currentSize / 0.01, currentSize / 0.01);
            effectMesh.material.opacity = THREE.MathUtils.lerp(0.8, 0, progress); // Исчезает со временем

            if (progress >= 1) {
                this.sceneManager.scene.remove(effectMesh);
                this.sceneManager.removeAnimationCallback(animationCallback);
            }
        };

        const animationCallback = (time, deltaTime) => animate(deltaTime);
        this.sceneManager.addAnimationCallback(animationCallback);
    }

    // --- Вспомогательные методы ---

    /**
     * Получает позицию цели в мировых координатах.
     * @param {Unit | {x: number, z: number}} target - Цель (юнит или координаты на доске).
     * @returns {THREE.Vector3 | null} Позиция в мире или null, если цель не найдена.
     */
    getTargetPosition(target) {
        if (target instanceof Unit) {
            // Если цель - юнит, берем позицию его модели и поднимаем повыше (чуть больше радиуса снаряда)
            return target.model.position.clone().add(new THREE.Vector3(0, 0.1, 0));
        } else if (target && typeof target.x === 'number' && typeof target.z === 'number') {
            // Если цель - координаты, конвертируем их в мировые координаты
            // Нужен доступ к Board или SceneManager для конвертации
            if (this.sceneManager && typeof this.sceneManager.getTileWorldPosition === 'function') {
                 // Поднимаем немного над землей
                 const groundPos = this.sceneManager.getTileWorldPosition(target.x, target.z);
                 if (groundPos) {
                    groundPos.y += 0.1; // Поднимаем повыше (чуть больше радиуса снаряда)
                 }
                 return groundPos;
            } else {
                 console.warn("Не могу получить мировые координаты для цели.");
                 return null; // Не можем определить позицию
            }
        }
        return null; // Некорректная цель
    }
}

// Импортируем Unit для проверки типа в instanceof
// Помещаем импорт сюда, чтобы избежать циклических зависимостей, если SkillAnimator будет импортирован в Unit
import { Unit } from './Unit.js'; 