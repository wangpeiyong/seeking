import java.util.Arrays;

public class QuickSort {
    public static void main(String[] args) {
        int[] numbers = {7, 2, 3, 9, 1, 8, 5, 4, 6};
        System.out.println(Arrays.toString(quickSort(numbers)));
    }

    private static int[] quickSort(int[] numbers) {
        if (numbers == null || numbers.length == 0) {
            return numbers;
        }
        quickSort(numbers, 0, numbers.length - 1);
        return numbers;
    }

    private static void quickSort(int[] numbers, int i, int j) {
        if (numbers.length == 0 || i >= j) {
            return;
        }
        int index = partition(numbers, i, j);
        quickSort(numbers, i, index - 1);
        quickSort(numbers, index + 1, j);
    }

    private static int partition(int[] numbers, int lo, int hi) {
        int index = lo;
        for (int i = lo; i < hi; i++) {
            if (numbers[i] <= numbers[hi]) {
                swap(numbers, i, index++);
            }
        }
        swap(numbers, hi, index);
        return index;
    }

    private static void swap(int[] numbers, int i, int j) {
        int temp = numbers[i];
        numbers[i] = numbers[j];
        numbers[j] = temp;
    }
}
