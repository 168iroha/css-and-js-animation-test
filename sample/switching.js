/** グローバルコンテキスト */
const ctx = {
	/** @type { SuspendGroup[] } 現在captureを実行しているSuspendGroup */
	stack: [],

	/**
	 * Promiseを登録する
	 * @param { Promise } promise キャプチャ対象のPromise
	 */
	resolve(promise) {
		const len = this.stack.length;
		if (len > 0) {
			this.stack[len - 1].resolve(promise);
		}
	}
};

/**
 * アニメーションの一時停止をグループ単位で実現するためのクラス
 */
class SuspendGroup {
	/** @type { Promise[][] } 解決対象のPromiseについてのスタック */
	#stack = [];
	/** @type { Promise[] | undefined } capture呼び出しの記憶 */
	#inst = undefined;
	/** @type { Set<Promise[]> } キャンセル対象のcapture呼び出しの集合 */
	#cancellSet = new Set();

	/**
	 * 遅延評価を行うためにPromiseをキャプチャする
	 * @param { () => unknown | Generator } callback キャプチャを実施する関数
	 * @param { boolean } cancellable キャンセル可能かの設定
	 */
	async capture(callback, cancellable = true) {
		/** @type { Promise[] } */
		const promiseList = [];
		if (cancellable) {
			// 呼び出しが存在していれば記憶
			if (this.#inst) {
				this.#cancellSet.add(this.#inst);
			}
			// capture呼び出しの記憶
			this.#inst = promiseList;
		}

		if (callback.constructor && callback.constructor.name === 'GeneratorFunction') {
			// resolve呼び出しを捕捉する			
			/** @type { Generator } */
			const generator = callback();
			let arg = [];
			while (true) {
				// 他からcaptureが発生したかの判定
				if (cancellable && this.#cancellSet.has(promiseList)) {
					break;
				}

				// Promiseのキャプチャ部
				promiseList.splice(0);
				ctx.stack.push(this);
				this.#stack.push(promiseList);
				const { done } = generator.next(arg);
				this.#stack.pop();
				ctx.stack.pop();

				if (done) {
					break;
				}
				// Promiseがキャプチャされていれば解決まで待機
				arg = promiseList.length > 0 ? await Promise.all(promiseList) : [];
			}
		}
		else {
			// 今は単に呼び出すだけ
			callback();
		}

		if (cancellable) {
			// 他からの呼び出しにより書き換えられなかった時はundefinedに戻す
			if (this.#inst === promiseList) {
				this.#inst = undefined;
			}
			// キャンセル対象から除去
			this.#cancellSet.delete(promiseList);
		}
	}

	/**
	 * Promiseを登録する
	 * @param { Promise } promise キャプチャ対象のPromise
	 */
	resolve(promise) {
		this.#stack[this.#stack.length - 1].push(promise);
	}
}

/**
 * DOM更新のためのSuspendGroup
 */
class SuspendGroupOnDOM extends SuspendGroup {
	/** @type { HTMLElement | undefined } ロード画面を生成する関数 */
	#page;
	/** @type { SuspendGroup | undefined } switchingPageのためのグループ */
	#suspendGroup;
	/** @type { SwitchingPage | undefined } ロード画面に関する遷移の実施 */
	#switchingPage;
	/** @type { HTMLElement | undefined } ロード画面を設置する対象 */
	#element
	
	/**
	 * コンストラクタ
	 * @param { HTMLElement } page 
	 * @param { element | undefined } element 
	 */
	constructor(page = undefined, element = undefined) {
		super();
		this.#page = page;
		this.#element = element;
		this.#suspendGroup = element ? new SuspendGroup() : undefined
		this.#switchingPage = element ? new SwitchingPage(this.#suspendGroup, element) : undefined;
	}

	/**
	 * ページ切り替えのためのオブジェクトの取得
	 */
	get switchingPage() {
		return this.#switchingPage;
	}

	/**
	 * 遅延評価を行うためにPromiseをキャプチャする
	 * @param { () => unknown | Generator } callback キャプチャを実施する関数
	 * @param { boolean } cancellable キャンセル可能かの設定
	 */
	async capture(callback, cancellable = true) {
		if (this.#page && this.#element) {
			const this_ = this;

			await super.capture(function* () {
				// ロード画面の表示
				const beforeSwiching = this_.#switchingPage.beforeSwiching;
				this_.#switchingPage.beforeSwiching = undefined;
				ctx.resolve(this_.#switchingPage.switching(this_.#page, cancellable));
				this_.#switchingPage.beforeSwiching = beforeSwiching;
				yield;

				// 裏でcallbackを処理
				yield ctx.resolve(this_.#suspendGroup.capture(callback, cancellable));

				// 	ロード画面の削除
				const afterSwiching = this_.#switchingPage.afterSwiching;
				this_.#switchingPage.afterSwiching = undefined;
				ctx.resolve(this_.#switchingPage.switching(this_.#element, cancellable));
				this_.#switchingPage.afterSwiching = afterSwiching;
				yield;
			}, cancellable);
		}
		else {
			await super.capture(callback, cancellable);
		}
	}
}

class SwitchingPage {
	/** @type { SuspendGroup } アニメーション制御のためのグループ */
	#suspendGroup;
	/** @type { HTMLElement } ページの切り替え対象 */
	#element;
	/** @type { ((element : HTMLElement) => unknown) | undefined } ページ切り替え前に発火するイベント */
	beforeSwiching = undefined;
	/** @type { ((element : HTMLElement) => unknown) | undefined } ページ切り替え後に発火するイベント */
	afterSwiching = undefined;

	/**
	 * コンストラクタ
	 * @param { SuspendGroup } suspendGroup アニメーション制御のためのグループ
	 * @param { HTMLElement } element ページの切り替え対象
	 */
	constructor(suspendGroup, element) {
		this.#suspendGroup = suspendGroup;
		this.#element = element;
	}

	/**
	 * 表示している要素の取得
	 */
	get element() { return this.#element; }

	/**
	 * DOMの付け替え
	 * @param { HTMLElement } prevElement 削除するページ
	 * @param { HTMLElement } nextElement 表示するページ
	 */
	static switchingElement(prevElement, nextElement) {
		if (prevElement !== nextElement) {
			prevElement.parentElement.insertBefore(nextElement, prevElement.nextElementSibling);
			prevElement.remove();
		}
	}

	/**
	 * ページの切り替え
	 * @param { (() => HTMLElement | Promise<HTMLElement>) | HTMLElement | Promise<HTMLElement> } page ページを生成する関数
	 * @param { boolean } cancellable キャンセル可能かの設定
	 */
	switching(page, cancellable = true) {
		// 画面の遷移先の構築を行うPromise/HTMLElementの作成
		const promiseNextElement = page instanceof Function ? page() : page;
		const this_ = this;
		const beforeSwiching = this.beforeSwiching;
		const afterSwiching = this.afterSwiching;

		return this.#suspendGroup.capture(function* () {
			yield beforeSwiching?.(this_.#element);
			let nextEleent = promiseNextElement;
			if (promiseNextElement instanceof Promise) {
				yield ctx.resolve(promiseNextElement.then(v => nextEleent = v));
			}
			// 要素を付け替える
			SwitchingPage.switchingElement(this_.#element, nextEleent);
			this_.#element = nextEleent;
			yield afterSwiching?.(this_.#element);
		}, cancellable);
	}
}
