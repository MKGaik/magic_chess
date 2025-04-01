export class UIManager {
  constructor() {
    this.unitManager = null;
    this.playerStatsContainer = null;
    this.opponentStatsContainer = null;
    this.selectedUnitInfo = null;
    this.skillPanel = null;
    
    // Добавляем отладочный вывод
    console.log("UIManager инициализирован");
  }

  init() {
    console.log("UIManager.init() вызван");
    // Откладываем инициализацию UI до полной загрузки DOM
    setTimeout(() => {
      // Получаем ссылки на элементы UI
      // Эти элементы больше не используются, но оставляем для обратной совместимости
      this.playerStatsContainer = true; // Заглушка
      this.opponentStatsContainer = true; // Заглушка
      
      this.selectedUnitInfo = document.getElementById('selected-unit-info');
      this.skillPanel = document.getElementById('skill-panel');
      
      console.log("UIManager нашел элементы:", {
        selectedUnitInfo: !!this.selectedUnitInfo,
        skillPanel: !!this.skillPanel
      });
      
      // Инициализируем UI
      this.updateUI();
    }, 500); // Увеличиваем задержку для уверенности в загрузке DOM
  }

  updateUI() {
    // Проверяем, инициализированы ли необходимые элементы
    if (!this.selectedUnitInfo) {
      console.log("Попытка повторного получения элементов UI...");
      // Повторно пытаемся получить элементы, если они не были найдены
      this.selectedUnitInfo = document.getElementById('selected-unit-info');
      this.skillPanel = document.getElementById('skill-panel');
    }
    
    // Проверяем, инициализированы ли необходимые компоненты
    if (!this.selectedUnitInfo) {
      console.error("Элемент selected-unit-info не найден. Убедитесь, что HTML-структура корректна.");
      return;
    }
    
    // Обновляем информацию о текущем ходе
    this.updateTurnInfo(this.unitManager?.game?.currentTurnColor);
    
    // Очищаем информацию о выбранном юните, если нет активного выбора
    if (this.selectedUnitInfo && !this.unitManager.game?.selectedUnit) {
      this.hideSelectedUnitInfo();
    }
  }

  updateUnitsInfo() {
    // Этот метод больше не используется, поскольку панели с информацией о фигурах нет
    // Оставляем его для обратной совместимости
    return;
  }
  
  createUnitInfoElement(unit) {
    // Создаем элемент для отображения информации о юните
    const unitInfo = document.createElement('div');
    unitInfo.className = 'unit-info';
    unitInfo.dataset.type = unit.type;
    unitInfo.dataset.x = unit.position.x;
    unitInfo.dataset.z = unit.position.z;
    
    // Добавляем информацию о юните
    unitInfo.innerHTML = `
      <div class="unit-header">
        <span class="unit-type">${this.getUnitDisplayName(unit.type)}</span>
        <span class="unit-pos">(${unit.position.x},${unit.position.z})</span>
      </div>
      <div class="unit-hp-container">
        HP: ${unit.hp}/${unit.maxHp}
        <div class="hp-bar"><div class="hp-fill" style="width: ${(unit.hp / unit.maxHp) * 100}%"></div></div>
      </div>
      <div class="unit-mp-container">
        MP: ${unit.mp}/${unit.maxMp}
        <div class="mp-bar"><div class="mp-fill" style="width: ${(unit.mp / unit.maxMp) * 100}%"></div></div>
      </div>
    `;
    
    // Если у юнита есть активные эффекты, добавляем индикатор
    if (unit.effects && unit.effects.length > 0) {
      unitInfo.classList.add('has-effect');
      
      // Добавляем подсказку с описанием эффектов
      const effectsText = unit.effects.map(effect => {
        switch (effect.type) {
          case 'buff':
            return `Усиление: +${effect.value} урона (ходов: ${effect.duration})`;
          case 'debuff':
            return `Ослабление: -${effect.value} урона (ходов: ${effect.duration})`;
          case 'stun':
            return `Оглушение (ходов: ${effect.duration})`;
          case 'shield':
            return `Щит: ${unit.shield} HP (ходов: ${effect.duration})`;
          default:
            return `Эффект: ${effect.type} (ходов: ${effect.duration})`;
        }
      }).join('\n');
      
      unitInfo.title = effectsText;
    }
    
    return unitInfo;
  }
  
  showSelectedUnit(unit) {
    // Проверяем, существует ли элемент для информации о выбранном юните
    if (!this.selectedUnitInfo) {
      console.warn("Элемент для отображения информации о выбранном юните не найден");
      return;
    }
    
    // Показываем информацию о выбранном юните
    this.selectedUnitInfo.innerHTML = '';
    
    // Создаем заголовок
    const header = document.createElement('h3');
    header.textContent = this.getUnitDisplayName(unit.type);
    this.selectedUnitInfo.appendChild(header);
    
    // Создаем основную информацию
    const info = document.createElement('div');
    info.className = 'selected-unit-details';
    
    // Проверка на наличие методов и свойств
    const actualDamage = typeof unit.getActualDamage === 'function' ? 
      unit.getActualDamage() : unit.baseDamage;
    
    info.innerHTML = `
      <div class="unit-stats">
        <div>Здоровье: ${unit.hp}/${unit.maxHp}</div>
        <div class="hp-bar"><div class="hp-fill" style="width: ${(unit.hp / unit.maxHp) * 100}%"></div></div>
        
        <div>Мана: ${unit.mp}/${unit.maxMp}</div>
        <div class="mp-bar"><div class="mp-fill" style="width: ${(unit.mp / unit.maxMp) * 100}%"></div></div>
        
        <div>Базовый урон: ${unit.baseDamage}</div>
        <div>Текущий урон: ${actualDamage}</div>
      </div>
    `;
    this.selectedUnitInfo.appendChild(info);
    
    // Проверяем наличие кнопок навыков
    if (unit.skills && unit.skills.length > 0) {
      // Обновляем кнопки навыков
      this.updateSkillButtons(unit);
    }
    
    // Обновляем индикаторы над фигурой
    if (typeof unit.updateStatusIndicators === 'function') {
      unit.updateStatusIndicators();
    }
    
    // Показываем панель умений
    if (this.skillPanel) {
      this.skillPanel.style.display = 'flex';
    }
  }
  
  updateSkillButtons(unit) {
    // Проверка наличия элементов кнопок навыков
    const skill1Btn = document.getElementById('skill-1-btn');
    const skill2Btn = document.getElementById('skill-2-btn');
    
    if (!skill1Btn || !skill2Btn) {
      console.warn("Кнопки навыков не найдены в DOM");
      return;
    }
    
    // Навык 1
    if (unit.skills && unit.skills.length > 0) {
      const skill1 = unit.skills[0];
      skill1Btn.innerHTML = `${skill1.name} <span class="mana-cost">${skill1.manaCost} MP</span> <span class="skill-info">?</span>`;
      
      // Добавляем информацию об уроне под названием скилла
      if (skill1.damage !== 0) {
        // Если урон отрицательный, значит это лечение
        if (skill1.damage < 0) {
          skill1Btn.innerHTML += `<div class="skill-damage heal">+${Math.abs(skill1.damage)} HP</div>`;
        } else if (skill1.damage > 0) {
          skill1Btn.innerHTML += `<div class="skill-damage damage">${skill1.damage} DMG</div>`;
        }
      }
      
      skill1Btn.title = `${skill1.description}\nУрон: ${skill1.damage > 0 ? skill1.damage : 'Н/Д'}\nМана: ${skill1.manaCost}\nКулдаун: ${skill1.currentCooldown}/${skill1.cooldown}`;
      
      // Отключаем кнопку, если навык нельзя использовать
      skill1Btn.disabled = skill1.currentCooldown > 0 || unit.mp < skill1.manaCost;
      
      // Добавляем обработчик событий для кнопки информации
      const infoBtn1 = skill1Btn.querySelector('.skill-info');
      if (infoBtn1) {
        infoBtn1.onclick = (e) => {
          e.stopPropagation(); // Останавливаем распространение события, чтобы не активировать сам навык
          this.showSkillInfo(skill1);
        };
      }
    }
    
    // Навык 2
    if (unit.skills && unit.skills.length > 1) {
      const skill2 = unit.skills[1];
      skill2Btn.innerHTML = `${skill2.name} <span class="mana-cost">${skill2.manaCost} MP</span> <span class="skill-info">?</span>`;
      
      // Добавляем информацию об уроне под названием скилла
      if (skill2.damage !== 0) {
        // Если урон отрицательный, значит это лечение
        if (skill2.damage < 0) {
          skill2Btn.innerHTML += `<div class="skill-damage heal">+${Math.abs(skill2.damage)} HP</div>`;
        } else if (skill2.damage > 0) {
          skill2Btn.innerHTML += `<div class="skill-damage damage">${skill2.damage} DMG</div>`;
        }
      }
      
      skill2Btn.title = `${skill2.description}\nУрон: ${skill2.damage > 0 ? skill2.damage : 'Н/Д'}\nМана: ${skill2.manaCost}\nКулдаун: ${skill2.currentCooldown}/${skill2.cooldown}`;
      
      // Отключаем кнопку, если навык нельзя использовать
      skill2Btn.disabled = skill2.currentCooldown > 0 || unit.mp < skill2.manaCost;
      
      // Добавляем обработчик событий для кнопки информации
      const infoBtn2 = skill2Btn.querySelector('.skill-info');
      if (infoBtn2) {
        infoBtn2.onclick = (e) => {
          e.stopPropagation(); // Останавливаем распространение события, чтобы не активировать сам навык
          this.showSkillInfo(skill2);
        };
      }
    }
  }
  
  showSkillInfo(skill) {
    // Проверяем наличие старого диалога и удаляем его
    const oldDialog = document.getElementById('skill-info-dialog');
    if (oldDialog) {
      document.body.removeChild(oldDialog);
    }
    
    // Создаем элемент диалога
    const dialog = document.createElement('div');
    dialog.id = 'skill-info-dialog';
    dialog.className = 'skill-info-dialog';
    
    // Заголовок с названием скилла
    const title = document.createElement('div');
    title.className = 'skill-dialog-title';
    title.textContent = skill.name;
    dialog.appendChild(title);
    
    // Описание скилла
    const desc = document.createElement('div');
    desc.className = 'skill-dialog-description';
    desc.textContent = skill.description;
    dialog.appendChild(desc);
    
    // Характеристики скилла
    const stats = document.createElement('div');
    stats.className = 'skill-dialog-stats';
    
    // Добавляем урон (если есть)
    if (skill.damage !== undefined) {
      const damage = document.createElement('div');
      damage.className = 'skill-stat';
      
      // Если урон отрицательный, это лечение
      if (skill.damage < 0) {
        damage.innerHTML = `<span class="stat-label">Лечение:</span> <span class="stat-value heal">${Math.abs(skill.damage)}</span>`;
      } else if (skill.damage > 0) {
        damage.innerHTML = `<span class="stat-label">Урон:</span> <span class="stat-value damage">${skill.damage}</span>`;
      }
      
      stats.appendChild(damage);
    }
    
    // Стоимость маны
    const mana = document.createElement('div');
    mana.className = 'skill-stat';
    mana.innerHTML = `<span class="stat-label">Стоимость:</span> <span class="stat-value mana">${skill.manaCost} MP</span>`;
    stats.appendChild(mana);
    
    // Перезарядка
    const cooldown = document.createElement('div');
    cooldown.className = 'skill-stat';
    cooldown.innerHTML = `<span class="stat-label">Перезарядка:</span> <span class="stat-value">${skill.cooldown} ходов</span>`;
    stats.appendChild(cooldown);
    
    // Добавляем дополнительные эффекты, если они есть
    if (skill.effectType && skill.effectType !== 'damage') {
      const effect = document.createElement('div');
      effect.className = 'skill-stat';
      effect.innerHTML = `<span class="stat-label">Эффект:</span> <span class="stat-value">${this.getEffectDescription(skill)}</span>`;
      stats.appendChild(effect);
    }
    
    dialog.appendChild(stats);
    
    // Кнопка закрытия
    const closeBtn = document.createElement('button');
    closeBtn.className = 'skill-dialog-close';
    closeBtn.textContent = 'ОК';
    closeBtn.onclick = () => {
      const dialogToRemove = document.getElementById('skill-info-dialog');
      if (dialogToRemove && dialogToRemove.parentNode) {
        dialogToRemove.parentNode.removeChild(dialogToRemove);
      }
    };
    dialog.appendChild(closeBtn);
    
    // Добавляем диалог в DOM
    document.body.appendChild(dialog);
    
    // Центрируем диалог
    dialog.style.left = `${(window.innerWidth - dialog.offsetWidth) / 2}px`;
    dialog.style.top = `${(window.innerHeight - dialog.offsetHeight) / 2}px`;
    
    // Добавляем обработчик клика вне диалога для закрытия
    setTimeout(() => {
      const outsideClickHandler = (e) => {
        // Проверяем, существует ли диалог и содержит ли он цель клика
        const dialogElement = document.getElementById('skill-info-dialog');
        if (dialogElement && !dialogElement.contains(e.target)) {
          // Удаляем диалог, только если он существует в DOM
          if (dialogElement.parentNode) {
            dialogElement.parentNode.removeChild(dialogElement);
          }
          document.removeEventListener('click', outsideClickHandler);
        }
      };
      document.addEventListener('click', outsideClickHandler);
    }, 100);
  }
  
  getEffectDescription(skill) {
    switch (skill.effectType) {
      case 'heal+cleanse':
        return 'Лечит и снимает дебаффы';
      case 'damage+stun':
        return 'Наносит урон и оглушает цель';
      case 'shield':
        return `Создает щит на ${skill.shieldValue} HP`;
      case 'buff':
        if (skill.buffValue) {
          return `Усиливает на +${skill.buffValue} урона`;
        }
        return 'Положительный эффект';
      case 'debuff':
        if (skill.debuffDamage) {
          return `Снижает урон на ${skill.debuffDamage}`;
        }
        return 'Отрицательный эффект';
      case 'heal+mana':
        return 'Восстанавливает здоровье и ману';
      default:
        return skill.effectType || '';
    }
  }
  
  getUnitDisplayName(type) {
    // Возвращает отображаемое имя типа юнита
    switch (type) {
      case 'pawn': return 'Пешка';
      case 'knight': return 'Конь';
      case 'bishop': return 'Слон';
      case 'rook': return 'Ладья';
      case 'queen': return 'Ферзь';
      case 'king': return 'Король';
      default: return type;
    }
  }
  
  getUnitTypeOrder(type) {
    // Возвращает порядок отображения юнитов
    switch (type) {
      case 'king': return 0;
      case 'queen': return 1;
      case 'bishop': return 2;
      case 'knight': return 3;
      case 'rook': return 4;
      case 'pawn': return 5;
      default: return 6;
    }
  }

  updateTurnInfo(currentTurnColor) {
    const currentTurn = document.getElementById('current-turn');
    if (currentTurn) {
      if (currentTurnColor === 'white') {
        currentTurn.textContent = 'Ход белых';
        currentTurn.style.color = '#ffffff';
      } else {
        currentTurn.textContent = 'Ход черных';
        currentTurn.style.color = '#888888';
      }
    }
  }

  hideSelectedUnitInfo() {
    // Скрываем информацию о выбранном юните
    if (this.selectedUnitInfo) {
      this.selectedUnitInfo.innerHTML = '';
    }
    
    // Скрываем панель умений
    if (this.skillPanel) {
      this.skillPanel.style.display = 'none';
    }
  }
  
  showMessage(message, duration = 2000) {
    // Создаем или находим элемент для сообщений
    let messageContainer = document.getElementById('game-message');
    
    if (!messageContainer) {
      messageContainer = document.createElement('div');
      messageContainer.id = 'game-message';
      messageContainer.style.position = 'absolute';
      messageContainer.style.top = '20%';
      messageContainer.style.left = '50%';
      messageContainer.style.transform = 'translate(-50%, -50%)';
      messageContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
      messageContainer.style.color = 'white';
      messageContainer.style.padding = '15px 20px';
      messageContainer.style.borderRadius = '5px';
      messageContainer.style.fontWeight = 'bold';
      messageContainer.style.fontSize = '18px';
      messageContainer.style.zIndex = '1000';
      messageContainer.style.textAlign = 'center';
      messageContainer.style.minWidth = '200px';
      messageContainer.style.boxShadow = '0 0 10px rgba(255, 0, 0, 0.5)';
      document.body.appendChild(messageContainer);
    }
    
    messageContainer.textContent = message;
    messageContainer.style.display = 'block';
    
    // Скрываем сообщение через указанное время
    setTimeout(() => {
      messageContainer.style.display = 'none';
    }, duration);
  }
  
  // Метод для показа всплывающего текста над юнитом
  showFloatingText(text, color, position3D, scene, camera) {
    const element = document.createElement('div');
    element.textContent = text;
    element.style.position = 'absolute';
    element.style.color = color;
    element.style.fontSize = '16px';
    element.style.fontWeight = 'bold';
    element.style.textShadow = '1px 1px 2px black';
    element.style.whiteSpace = 'nowrap';
    element.style.pointerEvents = 'none'; // Чтобы не мешал кликам
    element.style.zIndex = '1001'; // Выше других UI элементов
    element.style.transition = 'opacity 4.0s ease-out, transform 4.0s ease-out'; // Увеличена длительность анимации до 4с
    
    // Добавляем элемент в DOM (можно в специальный контейнер, если есть)
    document.body.appendChild(element);

    // Функция для обновления позиции и анимации
    const updatePositionAndAnimate = () => {
        // Проецируем 3D позицию в 2D экранные координаты
        const screenPosition = position3D.clone().project(camera);
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        
        const x = (screenPosition.x * 0.5 + 0.5) * windowWidth;
        const y = (-screenPosition.y * 0.5 + 0.5) * windowHeight;
        
        // Начальная позиция (немного выше юнита)
        element.style.left = `${x - element.offsetWidth / 2}px`;
        element.style.top = `${y - 30}px`; // Смещение вверх от точки
        element.style.opacity = '1';
        element.style.transform = 'translateY(0px)'; // Начальное положение
        
        // Запускаем анимацию через requestAnimationFrame для плавности
        requestAnimationFrame(() => {
            element.style.opacity = '0';
            element.style.transform = 'translateY(-50px)'; // Движение вверх
        });
    };

    // Вызываем обновление позиции сразу
    updatePositionAndAnimate();
    
    // Удаляем элемент через 4.5 секунды
    setTimeout(() => {
       if (element.parentNode) {
           element.parentNode.removeChild(element);
       }
    }, 4500); // Увеличено с 1500 до 4500
  }
} 